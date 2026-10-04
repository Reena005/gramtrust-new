import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { BellIcon } from '@heroicons/react/24/outline';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { MyComplaintsPage } from '@/features/complaints/my-complaints-page';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';

type Notification = {
  id: string;
  title: string;
  message: string;
  type: string;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

type NotificationsResponse = {
  success: boolean;
  count: number;
  data: Notification[];
};

type NotificationTab = 'complaints' | 'updates';

function getNotificationErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401) {
      return 'Your session has expired. Please sign in again.';
    }
    if (error.response?.status === 403) {
      return 'You are not authorized to view these notifications.';
    }
  }
  return 'Unable to load notifications. Please try again.';
}

function formatNotificationDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return formatDateTime(date.toISOString());
}

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<NotificationTab>('complaints');
  const [actionError, setActionError] = useState('');

  const {
    data: notifications = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<Notification[], unknown>({
    queryKey: ['notifications', 'list'],
    queryFn: async () => {
      const { data } = await apiClient.get<NotificationsResponse>('/notifications');
      return data.data;
    },
  });

  const markOneRead = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.patch(`/notifications/${encodeURIComponent(id)}/read`);
    },
    onSuccess: (_data, id) => {
      queryClient.setQueryData<Notification[]>(
        ['notifications', 'list'],
        (current = []) =>
          current.map((notification) =>
            notification.id === id
              ? { ...notification, read_at: new Date().toISOString() }
              : notification,
          ),
      );
      void queryClient.invalidateQueries({
        queryKey: ['notifications', 'unread-count'],
      });
    },
    onError: (mutationError) => {
      setActionError(getNotificationErrorMessage(mutationError));
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await apiClient.patch('/notifications/read-all');
    },
    onSuccess: () => {
      const readAt = new Date().toISOString();
      queryClient.setQueryData<Notification[]>(
        ['notifications', 'list'],
        (current = []) =>
          current.map((notification) =>
            notification.read_at
              ? notification
              : { ...notification, read_at: readAt },
          ),
      );
      void queryClient.invalidateQueries({
        queryKey: ['notifications', 'unread-count'],
      });
    },
    onError: (mutationError) => {
      setActionError(getNotificationErrorMessage(mutationError));
    },
  });

  const unreadCount = notifications.filter(
    (notification) => !notification.read_at,
  ).length;

  function handleMarkOneRead(id: string) {
    setActionError('');
    markOneRead.mutate(id);
  }

  function handleMarkAllRead() {
    setActionError('');
    markAllRead.mutate();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Citizen transparency"
        title="Notifications"
        description="Review your complaints and updates about them."
        actions={
          <Link
            to="/complaints/new"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Submit a Complaint
          </Link>
        }
      />

      <div
        className="flex flex-wrap gap-2 border-b border-slate-200 pb-3"
        role="tablist"
        aria-label="Notifications sections"
      >
        <Button
          role="tab"
          id="notifications-tab-complaints"
          aria-controls="notifications-panel-complaints"
          aria-selected={activeTab === 'complaints'}
          variant={activeTab === 'complaints' ? 'default' : 'outline'}
          onClick={() => setActiveTab('complaints')}
        >
          My Complaints
        </Button>
        <Button
          role="tab"
          id="notifications-tab-updates"
          aria-controls="notifications-panel-updates"
          aria-selected={activeTab === 'updates'}
          variant={activeTab === 'updates' ? 'default' : 'outline'}
          onClick={() => setActiveTab('updates')}
        >
          Complaint Updates
          {unreadCount > 0 && (
            <Badge variant="warning" className="ml-1 px-2 py-0.5">
              {unreadCount}
            </Badge>
          )}
        </Button>
      </div>

      {activeTab === 'complaints' ? (
        <section
          id="notifications-panel-complaints"
          role="tabpanel"
          aria-labelledby="notifications-tab-complaints"
        >
          <MyComplaintsPage embedded />
        </section>
      ) : (
        <section
          id="notifications-panel-updates"
          role="tabpanel"
          aria-labelledby="notifications-tab-updates"
          className="space-y-4"
        >
          <Card>
            <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <CardTitle>Complaint Updates</CardTitle>
                <CardDescription>
                  Notifications about changes to your complaints appear here.
                </CardDescription>
              </div>
              {unreadCount > 0 && (
                <Button
                  variant="outline"
                  onClick={handleMarkAllRead}
                  disabled={markAllRead.isPending}
                >
                  {markAllRead.isPending ? 'Marking...' : 'Mark all as read'}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {actionError && (
                <p role="alert" className="text-sm text-red-700">
                  {actionError}
                </p>
              )}

              {isLoading ? (
                <p className="py-5 text-center text-sm text-slate-600">
                  Loading notifications...
                </p>
              ) : isError ? (
                <div className="space-y-4 py-5 text-center">
                  <p role="alert" className="text-sm text-red-700">
                    {getNotificationErrorMessage(error)}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => void refetch()}
                    disabled={isFetching}
                  >
                    {isFetching ? 'Retrying...' : 'Retry'}
                  </Button>
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-600">
                  No notifications yet.
                </div>
              ) : (
                <ul className="space-y-3">
                  {notifications.map((notification) => {
                    const unread = !notification.read_at;
                    const content = (
                      <>
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">
                            {notification.title}
                          </span>
                          <Badge variant={unread ? 'warning' : 'secondary'}>
                            {unread ? 'Unread' : 'Read'}
                          </Badge>
                        </span>
                        <span className="block whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                          {notification.message}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {formatNotificationDate(notification.created_at)}
                        </span>
                      </>
                    );

                    return (
                      <li key={notification.id}>
                        {unread ? (
                          <button
                            type="button"
                            onClick={() => handleMarkOneRead(notification.id)}
                            disabled={markOneRead.isPending}
                            className="w-full space-y-2 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-left transition-colors hover:bg-amber-50 disabled:opacity-60"
                            aria-label={`Mark ${notification.title} as read`}
                          >
                            {content}
                          </button>
                        ) : (
                          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
                            {content}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <BellIcon className="h-4 w-4" aria-hidden="true" />
            Updates are provided when complaint notifications are available.
          </div>
        </section>
      )}
    </div>
  );
}
