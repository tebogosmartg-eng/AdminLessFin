import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { showError, showSuccess } from '../utils/toast';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const SeedData = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('seed-data');
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(); // Invalidate all queries to refetch new data
      showSuccess('Sample data has been added to your account!');
      navigate('/');
    },
    onError: (error: any) => {
      showError(`Seeding failed: ${error.message}`);
    },
  });

  return (
    <div className="flex items-center justify-center min-h-full">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Seed Sample Data</CardTitle>
          <CardDescription>
            Click the button below to populate your account with a comprehensive set of sample data for testing, including accounts, vendors, and customers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => mutation.mutate()}
            className="w-full"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Seeding...
              </>
            ) : (
              'Seed My Account'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SeedData;