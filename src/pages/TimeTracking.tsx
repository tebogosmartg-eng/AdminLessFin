import { Navigate } from 'react-router-dom';

export type Timesheet = {
  id: string;
  project_id: string;
  date: string;
  hours: number;
  notes: string | null;
  projects: { name: string } | null;
};

/**
 * Legacy Log Time route — preserved for bookmarks/deep links.
 * Canonical experience: Work Management → Time (billable timesheets tab).
 */
const TimeTracking = () => <Navigate to="/work/time?view=billing" replace />;

export default TimeTracking;
