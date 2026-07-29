import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { invokeWork } from '../../lib/work/api';
import { employeesQuery } from '../../lib/queries';
import { statusBadgeVariant } from '../../lib/utils';
import { showError, showSuccess } from '../../utils/toast';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Checkbox } from '../../components/ui/checkbox';
import { Skeleton } from '../../components/ui/skeleton';
import { ArrowLeft, Clock, Coffee, LogIn, LogOut } from 'lucide-react';

type EwmProject = { id: string; name: string };
type ClockSession = {
  id: string;
  employee_id?: string | null;
  ewm_project_id?: string | null;
  status: string;
  clocked_in_at: string;
  clocked_out_at?: string | null;
  break_minutes?: number;
  time_entry_id?: string | null;
};
type Employee = { id: string; first_name: string; last_name?: string; employee_number?: string };

export default function WorkClocking() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [employeeId, setEmployeeId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [locationLat, setLocationLat] = useState('');
  const [locationLng, setLocationLng] = useState('');
  const [qrRef, setQrRef] = useState('');
  const [photoRef, setPhotoRef] = useState('');
  const [offlineCaptured, setOfflineCaptured] = useState(false);

  const { data: projects = [] } = useQuery({
    queryKey: ['ewm_projects', activeCompany?.id],
    queryFn: () => invokeWork<EwmProject[]>(activeCompany!.id, 'LIST_EWM_PROJECTS'),
    enabled: !!activeCompany,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', activeCompany?.id],
    queryFn: async () => {
      const q = employeesQuery(activeCompany!.id);
      return q.queryFn();
    },
    enabled: !!activeCompany,
  });

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['ewm_clock_sessions', activeCompany?.id, employeeId || 'all'],
    queryFn: () =>
      invokeWork<ClockSession[]>(activeCompany!.id, 'LIST_CLOCK_SESSIONS', {
        ...(employeeId.trim() ? { employee_id: employeeId.trim() } : {}),
      }),
    enabled: !!activeCompany,
  });

  const extras = useMemo(
    () => ({
      ...(locationLat ? { location_lat: Number(locationLat) } : {}),
      ...(locationLng ? { location_lng: Number(locationLng) } : {}),
      ...(qrRef.trim() ? { qr_ref: qrRef.trim() } : {}),
      ...(photoRef.trim() ? { photo_ref: photoRef.trim() } : {}),
      offline_captured: offlineCaptured,
    }),
    [locationLat, locationLng, qrRef, photoRef, offlineCaptured],
  );

  const openSession = sessions.find((s) => s.status === 'open' || s.status === 'on_break');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ewm_clock_sessions'] });
    qc.invalidateQueries({ queryKey: ['ewm_time_entries'] });
  };

  const clockIn = useMutation({
    mutationFn: () =>
      invokeWork(activeCompany!.id, 'CLOCK_IN', {
        employee_id: employeeId.trim(),
        ewm_project_id: projectId || null,
        ...extras,
      }),
    onSuccess: () => {
      showSuccess('Clocked in.');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const breakStart = useMutation({
    mutationFn: () =>
      invokeWork(activeCompany!.id, 'CLOCK_BREAK_START', {
        session_id: openSession!.id,
        ...extras,
      }),
    onSuccess: () => {
      showSuccess('Break started.');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const breakEnd = useMutation({
    mutationFn: () =>
      invokeWork(activeCompany!.id, 'CLOCK_BREAK_END', {
        session_id: openSession!.id,
        ...extras,
      }),
    onSuccess: () => {
      showSuccess('Break ended.');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const clockOut = useMutation({
    mutationFn: () =>
      invokeWork(activeCompany!.id, 'CLOCK_OUT', {
        session_id: openSession!.id,
        ...extras,
      }),
    onSuccess: () => {
      showSuccess('Clocked out — draft time entry created for approval.');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const projectName = (id?: string | null) =>
    (id && projects.find((p) => p.id === id)?.name) || id || '—';

  return (
    <div className="space-y-6 p-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
          <Link to="/work">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Executive dashboard
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Clocking</h1>
        <p className="text-muted-foreground">
          Attendance / presence evidence (clock in, breaks, clock out). Approved work allocation lives under{' '}
          <Link className="underline" to="/work/time">
            Time
          </Link>
          .
        </p>
      </div>

      <Alert>
        <Clock className="h-4 w-4" />
        <AlertTitle>Presence channel — not the approved fact</AlertTitle>
        <AlertDescription>
          Closing a session writes a <strong>draft</strong> time entry for the linked project. Submit → approve →
          lock happens on Time before payroll input facts or billing projection.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Session controls</CardTitle>
          <CardDescription>Select employee and project, then clock in / break / out.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select
                value={employeeId || undefined}
                onValueChange={(v) => setEmployeeId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {(employees as Employee[]).map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.employee_number ? `${emp.employee_number} — ` : ''}
                      {emp.first_name} {emp.last_name || ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="mt-2"
                placeholder="Or paste employee UUID"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={projectId || undefined} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Latitude</Label>
              <Input value={locationLat} onChange={(e) => setLocationLat(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Longitude</Label>
              <Input value={locationLng} onChange={(e) => setLocationLng(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>QR ref</Label>
              <Input value={qrRef} onChange={(e) => setQrRef(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Photo ref</Label>
              <Input value={photoRef} onChange={(e) => setPhotoRef(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="offline"
              checked={offlineCaptured}
              onCheckedChange={(v) => setOfflineCaptured(v === true)}
            />
            <Label htmlFor="offline">Offline captured</Label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!employeeId.trim() || !projectId || !!openSession || clockIn.isPending}
              onClick={() => clockIn.mutate()}
            >
              <LogIn className="mr-2 h-4 w-4" />
              Clock in
            </Button>
            <Button
              variant="outline"
              disabled={!openSession || openSession.status !== 'open' || breakStart.isPending}
              onClick={() => breakStart.mutate()}
            >
              <Coffee className="mr-2 h-4 w-4" />
              Break start
            </Button>
            <Button
              variant="outline"
              disabled={!openSession || openSession.status !== 'on_break' || breakEnd.isPending}
              onClick={() => breakEnd.mutate()}
            >
              <Coffee className="mr-2 h-4 w-4" />
              Break end
            </Button>
            <Button
              variant="secondary"
              disabled={!openSession || clockOut.isPending}
              onClick={() => clockOut.mutate()}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Clock out
            </Button>
          </div>

          {openSession && (
            <div className="text-sm text-muted-foreground">
              Open session {openSession.id.slice(0, 8)}… · status{' '}
              <Badge variant={statusBadgeVariant(openSession.status)}>{openSession.status}</Badge> ·
              project {projectName(openSession.ewm_project_id)}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clock sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>In</TableHead>
                  <TableHead>Out</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Break (min)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Time entry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No clock sessions yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-sm">{s.clocked_in_at}</TableCell>
                      <TableCell className="text-sm">{s.clocked_out_at || '—'}</TableCell>
                      <TableCell>{projectName(s.ewm_project_id)}</TableCell>
                      <TableCell>{Number(s.break_minutes || 0)}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(s.status)}>{s.status}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {s.time_entry_id ? s.time_entry_id.slice(0, 8) + '…' : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
