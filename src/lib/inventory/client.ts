import { supabase } from '../../integrations/supabase/client';

function parseFunctionResult<T>(data: T | null, error: Error | null): T {
  if (error) throw new Error(error.message);
  if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}

export async function invokeInventory<T>(
  companyId: string,
  body: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('inventory', {
    body: { company_id: companyId, ...body },
  });
  return parseFunctionResult<T>(data, error);
}
