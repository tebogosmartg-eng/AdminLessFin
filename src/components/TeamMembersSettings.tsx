import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { PlusCircle, MoreHorizontal } from 'lucide-react';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import InviteMemberDialog from './InviteMemberDialog';

type CompanyMember = {
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  profiles: {
    full_name: string;
    email: string;
  }[] | null;
};

const TeamMembersSettings = () => {
  const { activeCompany } = useAuth();
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  const { data: members, isLoading } = useQuery<CompanyMember[]>({
    queryKey: ['company_members', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase
        .from('company_users')
        .select('user_id, role, profiles(full_name, email)')
        .eq('company_id', activeCompany.id);
      if (error) throw error;
      return data as CompanyMember[];
    },
    enabled: !!activeCompany,
  });

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>Manage who has access to this company.</CardDescription>
            </div>
            <Button onClick={() => setIsInviteOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Invite Member
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(2)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={4}><Skeleton className="h-5 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : members && members.length > 0 ? (
                members.map(member => (
                  <TableRow key={member.user_id}>
                    <TableCell>{member.profiles?.[0]?.full_name}</TableCell>
                    <TableCell>{member.profiles?.[0]?.email}</TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize">{member.role}</Badge></TableCell>
                    <TableCell>
                      {/* Placeholder for future actions like remove/edit role */}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">You are the only member of this company.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <InviteMemberDialog isOpen={isInviteOpen} setIsOpen={setIsInviteOpen} />
    </>
  );
};

export default TeamMembersSettings;