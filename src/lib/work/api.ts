import { supabase } from '../../integrations/supabase/client';

export async function invokeWork<T = unknown>(
  companyId: string,
  method: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('work', {
    body: { method, company_id: companyId, ...payload },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}
