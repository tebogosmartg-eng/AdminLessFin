import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Bell } from 'lucide-react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';

type Notification = {
  id: string;
  created_at: string;
  content: string;
  link_to: string | null;
  is_read: boolean;
};

const NotificationBell = () => {
  const { user, activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const fetchNotifications = async () => {
    if (!user || !activeCompany) return [];
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .eq('company_id', activeCompany.id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw error;
    return data;
  };

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ['notifications', user?.id, activeCompany?.id],
    queryFn: fetchNotifications,
    enabled: !!user && !!activeCompany,
  });

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    const channel = supabase
      .channel(`public:notifications:user_id=eq.${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        queryClient.invalidateQueries({ queryKey: ['notifications', userId, activeCompany?.id] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, activeCompany?.id, queryClient]);

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationIds: string[]) => {
      if (notificationIds.length === 0) return;
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', notificationIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id, activeCompany?.id] });
    },
  });

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
      if (unreadIds.length > 0) {
        markAsReadMutation.mutate(unreadIds);
      }
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (notification.link_to) {
      navigate(notification.link_to);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
              {unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length > 0 ? (
          notifications.map(notification => (
            <DropdownMenuItem
              key={notification.id}
              className="flex flex-col items-start gap-1 cursor-pointer"
              onClick={() => handleNotificationClick(notification)}
            >
              <p className="text-sm font-medium">{notification.content}</p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
              </p>
            </DropdownMenuItem>
          ))
        ) : (
          <div className="p-4 text-center text-sm text-muted-foreground">
            You have no new notifications.
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationBell;