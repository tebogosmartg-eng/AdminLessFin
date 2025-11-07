import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Send, User, Paperclip, X, Loader2 } from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../lib/utils';

type Message = {
  id: string;
  created_at: string;
  content: string;
  user_id: string;
  attachment_url: string | null;
  attachment_name: string | null;
  profiles: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

const Chat = () => {
  const { user, activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const fetchMessages = async () => {
    if (!activeCompany) return [];
    const { data, error } = await supabase
      .from('messages')
      .select('*, profiles(full_name, avatar_url)')
      .eq('company_id', activeCompany.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  };

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ['messages', activeCompany?.id],
    queryFn: fetchMessages,
    enabled: !!activeCompany,
  });

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
          console.error("Error fetching profile for new message:", error);
          return;
        }

        const newMessageWithProfile = { ...payload.new, profiles: profileData } as Message;
        queryClient.setQueryData(['messages', activeCompany.id], (oldData: Message[] | undefined) => [...(oldData || []), newMessageWithProfile]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeCompany, queryClient]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, attachmentUrl, attachmentName }: { content: string, attachmentUrl: string | null, attachmentName: string | null }) => {
      if (!user || !activeCompany) throw new Error('User or company not found');
      const { error } = await supabase.from('messages').insert({
        content,
        user_id: user.id,
        company_id: activeCompany.id,
        attachment_url: attachmentUrl,
        attachment_name: attachmentName,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewMessage('');
      setFile(null);
    },
    onError: (error) => {
      console.error("Error sending message:", error);
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() && !file) return;

    let attachmentUrl: string | null = null;
    let attachmentName: string | null = null;

    if (file) {
      const filePath = `${activeCompany?.id}/${user?.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('chat_attachments')
        .upload(filePath, file);

      if (uploadError) {
        console.error("Error uploading file:", uploadError);
        return;
      }

      const { data: urlData } = supabase.storage
        .from('chat_attachments')
        .getPublicUrl(filePath);
      
      attachmentUrl = urlData.publicUrl;
      attachmentName = file.name;
    }

    sendMessageMutation.mutate({ content: newMessage.trim(), attachmentUrl, attachmentName });
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '';
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  return (
    <Card className="h-[calc(100vh-7rem)] flex flex-col">
      <CardHeader>
        <CardTitle>Company Chat</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-12 w-3/4 ml-auto" />
            <Skeleton className="h-12 w-3/4" />
          </div>
        ) : messages.length > 0 ? (
          messages.map(message => (
            <div
              key={message.id}
              className={cn(
                "flex items-start gap-3",
                message.user_id === user?.id && "justify-end"
              )}
            >
              {message.user_id !== user?.id && (
                <Avatar className="h-8 w-8">
                  <AvatarImage src={message.profiles?.avatar_url || undefined} />
                  <AvatarFallback>
                    {message.profiles?.full_name ? getInitials(message.profiles.full_name) : <User className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className={cn(
                "max-w-xs md:max-w-md p-3 rounded-lg",
                message.user_id === user?.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              )}>
                <p className="font-semibold text-sm">{message.profiles?.full_name || 'Unknown User'}</p>
                {message.content && <p className="text-sm whitespace-pre-wrap">{message.content}</p>}
                {message.attachment_url && (
                  <a href={message.attachment_url} target="_blank" rel="noopener noreferrer" className={cn("flex items-center mt-2 p-2 rounded-md hover:bg-black/20", message.user_id === user?.id ? "bg-primary-foreground/10" : "bg-background/50")}>
                    <Paperclip className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="truncate text-sm">{message.attachment_name}</span>
                  </a>
                )}
                <p className="text-xs opacity-70 mt-1 text-right">
                  {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                </p>
              </div>
              {message.user_id === user?.id && (
                <Avatar className="h-8 w-8">
                  <AvatarImage src={message.profiles?.avatar_url || undefined} />
                  <AvatarFallback>
                    {message.profiles?.full_name ? getInitials(message.profiles.full_name) : <User className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">No messages yet. Start the conversation!</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </CardContent>
      <CardFooter className="flex-col items-start gap-2">
        {file && (
          <div className="text-sm text-muted-foreground flex items-center gap-2 bg-muted p-2 rounded-md w-full">
            <Paperclip className="h-4 w-4" />
            <span className="flex-1 truncate">{file.name}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setFile(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        <form onSubmit={handleSendMessage} className="flex w-full items-center space-x-2">
          <Button asChild variant="ghost" size="icon" className="flex-shrink-0">
            <label htmlFor="file-upload" className="cursor-pointer">
              <Paperclip className="h-5 w-5" />
              <input id="file-upload" type="file" className="hidden" onChange={handleFileChange} />
            </label>
          </Button>
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message or add a file..."
            autoComplete="off"
          />
          <Button type="submit" disabled={sendMessageMutation.isPending}>
            {sendMessageMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
};

export default Chat;