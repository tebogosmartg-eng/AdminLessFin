import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { securityService } from '@/governance/domains/security/service';
import type { RawCompanyMemberRow } from '@/governance/domains/security/service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { PlusCircle, MoreHorizontal, Shield, ShieldOff, Trash2 } from 'lucide-react';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import InviteMemberDialog from './InviteMemberDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { showError, showSuccess } from '../utils/toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

type CompanyMember = RawCompanyMemberRow;

const TeamMembersSettings = () => {
  const { activeCompany, user } = useAuth();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<CompanyMember | null>(null);
  const queryClient = useQueryClient();

  const { data: members, isLoading } = useQuery<CompanyMember[]>({
    queryKey: ['company_members', activeCompany?.id],
    // Phase G3.6 — team member list resolves through Governance Security Service.
    // Raw edge shape preserved (identical to pre-migration GET_TEAM_MEMBERS).
    queryFn: async () => {
      if (!activeCompany) return [];
      return securityService.getCompanyMembersRaw(activeCompany.id);
    },
    enabled: !!activeCompany,
  });

  const updateRoleMutation = useMutation({
    // Phase G3.6 — role updates resolve through Governance Security Service.
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: 'admin' | 'member' }) => {
      if (!activeCompany) throw new Error("No active company");
      const result = await securityService.updateMemberRole(activeCompany.id, userId, newRole);
      if (!result.success) throw new Error(result.error || 'Failed to update member role.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company_members'] });
      showSuccess("Member role updated.");
    },
    onError: (e: unknown) => showError(e instanceof Error ? e.message : String(e)),
  });

  const removeMemberMutation = useMutation({
    // Phase G3.6 — member removal resolves through Governance Security Service.
    mutationFn: async (userId: string) => {
      if (!activeCompany) throw new Error("No active company");
      const result = await securityService.removeMember(activeCompany.id, userId);
      if (!result.success) throw new Error(result.error || 'Failed to remove member.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company_members'] });
      showSuccess("Member removed from company.");
      setMemberToRemove(null);
    },
    onError: (e: unknown) => showError(e instanceof Error ? e.message : String(e)),
  });

  // Local UI gate — Security has no permission-evaluator API yet (documented debt).
  // Outcome identical to pre-migration: owner/admin may manage.
  const currentUserRole = members?.find(m => m.user_id === user?.id)?.role;
  const canManage = currentUserRole === 'owner' || currentUserRole === 'admin';

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>Manage who has access to this company.</CardDescription>
            </div>
            {canManage && (
              <Button onClick={() => setIsInviteOpen(true)}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Invite Member
              </Button>
            )}
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
                    <TableCell>{member.profiles?.full_name || 'Pending User'}</TableCell>
                    <TableCell>{member.profiles?.email}</TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize">{member.role}</Badge></TableCell>
                    <TableCell>
                      {canManage && member.role !== 'owner' && member.user_id !== user?.id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            {member.role === 'member' ? (
                              <DropdownMenuItem onClick={() => updateRoleMutation.mutate({ userId: member.user_id, newRole: 'admin' })}>
                                <Shield className="mr-2 h-4 w-4" /> Promote to Admin
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => updateRoleMutation.mutate({ userId: member.user_id, newRole: 'member' })}>
                                <ShieldOff className="mr-2 h-4 w-4" /> Demote to Member
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setMemberToRemove(member)} className="text-red-600">
                              <Trash2 className="mr-2 h-4 w-4" /> Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
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

      <AlertDialog open={!!memberToRemove} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{memberToRemove?.profiles?.full_name}</strong> from the company? They will lose access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => memberToRemove && removeMemberMutation.mutate(memberToRemove.user_id)}
              className="bg-red-600 hover:bg-red-700"
              disabled={removeMemberMutation.isPending}
            >
              {removeMemberMutation.isPending ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default TeamMembersSettings;
