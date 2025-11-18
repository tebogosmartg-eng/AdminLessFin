import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { showError, showSuccess } from '../utils/toast';
import { Project } from '../pages/Projects';
import { Timesheet } from '../pages/TimeTracking';
import { format } from 'date-fns';

const timesheetSchema = z.object({
  project_id: z.string().min(1, 'Project is required.'),
  date: z.string().min(1, 'Date is required.'),
  hours: z.coerce.number().min(0.25, 'Hours must be at least 0.25.').max(24, 'Cannot log more than 24 hours.'),
  notes: z.string().optional(),
});

type TimesheetFormValues = z.infer<typeof timesheetSchema>;

interface TimesheetFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  timesheet?: Timesheet;
}

const TimesheetForm = ({ isOpen, setIsOpen, timesheet }: TimesheetFormProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<TimesheetFormValues>({
    resolver: zodResolver(timesheetSchema),
  });

  useEffect(() => {
    if (timesheet) {
      form.reset({
        project_id: timesheet.project_id,
        date: timesheet.date,
        hours: timesheet.hours,
        notes: timesheet.notes || '',
      });
    } else {
      form.reset({
        project_id: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        hours: 8,
        notes: '',
      });
    }
  }, [timesheet, form, isOpen]);

  const { data: projects } = useQuery<Project[]>({ queryKey: ['projects', activeCompany?.id] });

  const mutation = useMutation({
    mutationFn: async (values: TimesheetFormValues) => {
      if (!activeCompany) throw new Error('No active company selected');

      const method = timesheet ? 'PUT' : 'POST';
      const body = {
        method,
        company_id: activeCompany.id,
        timesheetData: values,
        ...(timesheet && { timesheetId: timesheet.id }),
      };

      const { error } = await supabase.functions.invoke('timesheets', { body });

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets', activeCompany?.id] });
      showSuccess(`Time entry ${timesheet ? 'updated' : 'logged'} successfully.`);
      setIsOpen(false);
    },
    onError: (error) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (values: TimesheetFormValues) => {
    mutation.mutate(values);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{timesheet ? 'Edit Time Entry' : 'Log Time'}</DialogTitle>
          <DialogDescription>Enter your hours for a project.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="project_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a project" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {projects?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="hours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hours</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.25" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="What did you work on?" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving...' : 'Save Entry'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default TimesheetForm;