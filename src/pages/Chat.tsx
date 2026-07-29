import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Send, User, MessageSquare, Users, ExternalLink } from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../lib/utils';
import { RealtimeChannel } from '@supabase/supabase-js';
import { messagesQuery, teamMembersQuery } from '../lib/queries';
import type { RawCompanyMemberRow } from '@/governance/domains/security/service';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { EmptyState } from '../components/EmptyState';
import { showError } from '../utils/toast';
import { parseChatContext, formatChatContextPrefix } from '../lib/boe/contextualChat';
import LifecycleContextBadge from '../components/boe/LifecycleContextBadge';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import type { LifecycleId } from '../lib/businessLifecycles';

type Message = {
  id: string;
  created_at: string;
  content: string;
  user_id: string;
  profiles: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

type Presence = {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
};

type TeamMember = RawCompanyMemberRow;

const Chat = () => {
  useDocumentTitle('Collaboration Hub');
  const [searchParams] = useSearchParams();
  const chatContext = useMemo(() => parseChatContext(searchParams), [searchParams]);
  const { user, profile, activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<Record<string, Presence[]>>({});
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const {
    data: messages = [],
    isLoading,
    isError: messagesError,
    refetch: refetchMessages,
  } = useQuery<Message[]>({
    ...messagesQuery(activeCompany!.id),
    enabled: !!activeCompany,
    retry: 1,
  });

  useEffect(() => {
    if (!user || !activeCompany || !profile) return;

    const channel: RealtimeChannel = supabase.channel(`company-chat:${activeCompany.id}`, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState() as Record<string, Presence[]>;
        setOnlineUsers(presenceState);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        setOnlineUsers((prev) => ({ ...prev, [key]: newPresences as unknown as Presence[] }));
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        setOnlineUsers((prev) => {
          const newState = { ...prev };
          delete newState[key];
          return newState;
        });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: user.id,
            full_name: profile.full_name,
            avatar_url: profile.avatar_url,
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, activeCompany, profile]);

  useEffect(() => {
    if (!activeCompany) return;

    const channel = supabase
      .channel(`public:messages:company_id=eq.${activeCompany.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const { data: profileData, error } = await supabase
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('id', payload.new.user_id)
          .single();

        if (error) {
          console.error('Error fetching profile for new message:', error);
          return;
        }

        const newMessageWithProfile = { ...payload.new, profiles: profileData } as Message;
        queryClient.setQueryData(['messages', activeCompany.id], (oldData: Message[] | undefined) => [
          ...(oldData || []),
          newMessageWithProfile,
        ]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeCompany, queryClient]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    ...teamMembersQuery(activeCompany!.id),
    enabled: !!activeCompany,
    retry: 1,
  });

  const mentionHint = useMemo(() => {
    if (!teamMembers?.length) return '';
    const names = teamMembers
      .map((member) => member.profiles?.full_name)
      .filter(Boolean)
      .slice(0, 3)
      .join(', ');
    return names ? `Mention teammates with @ (e.g. ${names})` : '';
  }, [teamMembers]);

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!activeCompany) throw new Error('Company not found');
      const { data, error } = await supabase.functions.invoke('messages', {
        body: {
          method: 'POST',
          company_id: activeCompany.id,
          content,
        },
      });
      if (error) throw new Error(error.message);
      if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
        throw new Error((data as { error: string }).error);
      }
      return data;
    },
    onSuccess: () => {
      setNewMessage('');
    },
    onError: (error) => {
      showError(error instanceof Error ? error.message : 'Failed to send message');
    },
  });

  const sendCurrentMessage = () => {
    if (newMessage.trim()) {
      sendMessageMutation.mutate(newMessage.trim());
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    sendCurrentMessage();
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase();
  };

  const onlineUserIds = useMemo(() => {
    return new Set(
      Object.values(onlineUsers)
        .map((presences) => presences[0]?.user_id)
        .filter(Boolean)
    );
  }, [onlineUsers]);

  const sortedTeamMembers = useMemo(() => {
    return [...teamMembers].sort((a, b) => {
      const aOnline = onlineUserIds.has(a.user_id) ? 0 : 1;
      const bOnline = onlineUserIds.has(b.user_id) ? 0 : 1;
      if (aOnline !== bOnline) return aOnline - bOnline;
      return (a.profiles?.full_name || '').localeCompare(b.profiles?.full_name || '');
    });
  }, [teamMembers, onlineUserIds]);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:h-[calc(100vh-7rem)]">
      <Card className="flex flex-1 flex-col min-h-[60vh] lg:min-h-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            {chatContext ? 'Contextual Discussion' : 'Collaboration Hub'}
          </CardTitle>
          <CardDescription>
            {chatContext
              ? 'Discuss this business object with your team. Messages are company-wide until entity threads ship.'
              : 'Company-wide discussions for approvals, month-end close, payroll and finance questions.'}
          </CardDescription>
          {chatContext && (
            <Alert className="mt-3">
              <MessageSquare className="h-4 w-4" />
              <AlertTitle className="flex flex-wrap items-center gap-2">
                {formatChatContextPrefix(chatContext)}
                <LifecycleContextBadge
                  lifecycleId={chatContext.lifecycleId as LifecycleId}
                  stageId={chatContext.stageId}
                  compact
                />
              </AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-2 mt-1">
                <span>Reference this object in your message for clarity.</span>
                <Button variant="outline" size="sm" asChild>
                  <Link to={chatContext.route}>
                    View record <ExternalLink className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-12 w-3/4" />
              <Skeleton className="h-12 w-3/4 ml-auto" />
              <Skeleton className="h-12 w-3/4" />
            </div>
          ) : messagesError ? (
            <EmptyState
              icon={MessageSquare}
              title="Could not load messages"
              description="The collaboration service is temporarily unavailable. Try again in a moment."
              action={
                <Button variant="outline" onClick={() => refetchMessages()}>
                  Retry
                </Button>
              }
            />
          ) : messages.length > 0 ? (
            messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex items-start gap-3',
                  message.user_id === user?.id && 'justify-end'
                )}
              >
                {message.user_id !== user?.id && (
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={message.profiles?.avatar_url || undefined} />
                    <AvatarFallback>
                      {message.profiles?.full_name ? (
                        getInitials(message.profiles.full_name)
                      ) : (
                        <User className="h-4 w-4" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={cn(
                    'max-w-xs md:max-w-md p-3 rounded-lg',
                    message.user_id === user?.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  <p className="font-semibold text-sm">
                    {message.profiles?.full_name || 'Unknown User'}
                  </p>
                  <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                  <p className="text-xs opacity-70 mt-1 text-right">
                    {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                  </p>
                </div>
                {message.user_id === user?.id && (
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={message.profiles?.avatar_url || undefined} />
                    <AvatarFallback>
                      {message.profiles?.full_name ? (
                        getInitials(message.profiles.full_name)
                      ) : (
                        <User className="h-4 w-4" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))
          ) : (
            <EmptyState
              icon={MessageSquare}
              title="Start your first finance conversation"
              description="Use this space for month-end checklists, approval questions, payroll coordination, or anything your team needs to resolve together."
            />
          )}
          <div ref={messagesEndRef} />
        </CardContent>
        <CardFooter>
          <form onSubmit={handleSendMessage} className="flex w-full items-end space-x-2">
            <Textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={mentionHint || 'Ask a question or share an update…'}
              className="min-h-[44px] resize-none"
              rows={1}
              aria-label="Message"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendCurrentMessage();
                }
              }}
            />
            <Button
              type="submit"
              disabled={sendMessageMutation.isPending || !newMessage.trim()}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardFooter>
      </Card>

      <Card className="w-full lg:w-72 shrink-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Team
          </CardTitle>
          <CardDescription>
            {onlineUserIds.size} online · {teamMembers.length} members
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[40vh] lg:max-h-none overflow-y-auto">
          {sortedTeamMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No team members found.</p>
          ) : (
            sortedTeamMembers.map((member) => {
              const isOnline = onlineUserIds.has(member.user_id);
              return (
                <div key={member.user_id} className="flex items-center gap-3 rounded-md px-1 py-1.5">
                  <div className="relative">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={member.profiles?.avatar_url || undefined} />
                      <AvatarFallback>
                        {getInitials(member.profiles?.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={cn(
                        'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card',
                        isOnline ? 'bg-green-500' : 'bg-muted-foreground/30'
                      )}
                      aria-hidden
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {member.profiles?.full_name || member.profiles?.email || 'Team member'}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize truncate">
                      {member.role}
                      {isOnline ? ' · Online' : ''}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Chat;
