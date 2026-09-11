import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Trash2, UserPlus, X, Mail, Search, Shield, CheckCircle } from 'lucide-react';
import CustomSelect, { Option } from '../../components/CustomSelect';
import { User } from '../../types';
import { useToast } from '../../context/ToastContext';
import { adminAPI } from '../../services/api';
import { AdminTeamSkeleton } from './skeletons';

// Team management tab (extracted from Admin.tsx): admin list, invitations,
// member removal. Fully self-contained.
const TeamTab: React.FC = () => {
  const { addToast } = useToast();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const [admins, setAdmins] = useState<User[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  // Team Management State
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('Content Manager');

  // Team Member Removal Confirmation Modal State
  const [removeTeamMemberConfirmation, setRemoveTeamMemberConfirmation] = useState<{
    isOpen: boolean;
    id: string | null;
    name: string | null;
  }>({
    isOpen: false,
    id: null,
    name: null
  });
  const [isInviting, setIsInviting] = useState(false);
  const [isRemovingAdmin, setIsRemovingAdmin] = useState<string | null>(null);

  const roleOptions: Option[] = [
    { label: 'Content Manager (Can upload & edit)', value: 'Content Manager' },
    { label: 'Super Admin (Full access)', value: 'Super Admin' }
    // NOTE: no "Viewer (read-only)" option — the backend only knows ADMIN /
    // MODERATOR, so that label previously invited full content managers
    // under a read-only promise.
  ];

  // created_at/joinedDate are optional — never render "Invalid Date"
  const formatMemberDate = (value?: string): string => {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
  };

  // Fetch admin team members
  const fetchAdmins = useCallback(async () => {
    try {
      setAdminLoading(true);
      const adminData = await adminAPI.getAdmins();
      setAdmins(adminData);
    } catch (error: any) {
      console.error('Failed to fetch admins:', error);
      addToast('Failed to load admin team', 'error');
    } finally {
      setAdminLoading(false);
    }
  }, [addToast]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !inviteName) return;

    setIsInviting(true);
    try {
      await adminAPI.inviteAdmin({
        email: inviteEmail,
        name: inviteName,
        role: inviteRole === 'Super Admin' ? 'ADMIN' : 'MODERATOR'
      });
      setIsInviteOpen(false);
      setInviteName('');
      setInviteEmail('');
      addToast(`Invitation sent to ${inviteEmail}`, 'success');
    } catch (error: any) {
      addToast(error.message || 'Failed to send invitation', 'error');
    } finally {
      setIsInviting(false);
    }
  };

  // Careers Management Functions

  const handleRemoveAdmin = (id: string, name: string) => {
    setRemoveTeamMemberConfirmation({
      isOpen: true,
      id: id,
      name: name
    });
  };

  const confirmRemoveTeamMember = async () => {
    if (!removeTeamMemberConfirmation.id) return;

    setIsRemovingAdmin(removeTeamMemberConfirmation.id);
    try {
      await adminAPI.removeAdmin(removeTeamMemberConfirmation.id);
      await fetchAdmins(); // Refresh admin list
      addToast('Team member removed successfully', 'success');
      setRemoveTeamMemberConfirmation({ isOpen: false, id: null, name: null });
    } catch (error: any) {
      console.error('Remove admin error:', error);
      // Extract error message - could be in error.message or error.response.data.message
      const errorMessage = error?.message || error?.response?.data?.message || 'Failed to remove team member. Please try again.';
      addToast(errorMessage, 'error');
    } finally {
      setIsRemovingAdmin(null);
    }
  };

  const closeRemoveTeamMemberConfirmation = () => {
    setRemoveTeamMemberConfirmation({ isOpen: false, id: null, name: null });
  };

  useEffect(() => {
    fetchAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
        <div className="space-y-4 sm:space-y-8 animate-fade-in">
           <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-end gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-zinc-900">Admin Team</h2>
                <p className="text-xs sm:text-sm text-zinc-500">Manage admins and moderators with access to the admin panel.</p>
              </div>
              <button 
                onClick={() => setIsInviteOpen(true)}
                className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                <UserPlus size={16} /> <span>Invite Member</span>
              </button>
           </div>

           {adminLoading ? (
             <AdminTeamSkeleton />
           ) : (
             <>
               {/* Separate Active and Inactive Members */}
               {(() => {
                 const activeMembers = admins.filter((member: any) => (member.status || 'Active') === 'Active');
                 const inactiveMembers = admins.filter((member: any) => (member.status || 'Active') !== 'Active');
                 
                 return (
                   <div className="space-y-6">
                     {/* Active Members Section */}
                     <div>
                       <div className="flex items-center gap-2 mb-4">
                         <div className="w-1 h-5 bg-emerald-500 rounded-full"></div>
                         <h3 className="text-sm font-bold text-zinc-900">Active Members ({activeMembers.length})</h3>
                       </div>
                       
                       {/* Mobile Card Layout - Active */}
                       <div className="md:hidden space-y-3">
                         {activeMembers.length > 0 ? (
                           activeMembers.map((member) => (
                             <div key={member.id} className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4">
                               <div className="flex items-start justify-between mb-3">
                                 <div className="flex items-center gap-3 flex-1 min-w-0">
                                   <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-sm font-bold text-zinc-600 flex-shrink-0">
                                     {member.name.charAt(0)}
                                   </div>
                                   <div className="flex-1 min-w-0">
                                     <h4 className="font-medium text-zinc-900 truncate">{member.name}</h4>
                                     <p className="text-xs text-zinc-500 truncate">{member.email}</p>
                                   </div>
                                 </div>
                                 <button
                                   onClick={() => handleRemoveAdmin(member.id, member.name)}
                                   disabled={isRemovingAdmin === member.id}
                                   className="ml-2 p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                 >
                                   {isRemovingAdmin === member.id ? (
                                     <Loader2 size={16} className="animate-spin" />
                                   ) : (
                                     <Trash2 size={16} />
                                   )}
                                 </button>
                               </div>
                               <div className="flex items-center justify-between text-xs">
                                 <div className="flex items-center gap-2 flex-wrap">
                                   <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                     member.role === 'ADMIN' 
                                       ? 'bg-zinc-900 text-white' 
                                       : 'bg-blue-50 text-blue-700 border border-blue-100'
                                   }`}>
                                     {member.role === 'ADMIN' ? 'Super Admin' : member.role === 'MODERATOR' ? 'Content Manager' : member.role}
                                   </span>
                                   <span className="px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-100 text-[10px]">
                                     Active
                                   </span>
                                 </div>
                                  <span className="text-zinc-400 text-[10px]">
                                    {formatMemberDate((member as any).created_at || (member as any).joinedDate)}
                                  </span>
                               </div>
                             </div>
                           ))
                         ) : (
                           <div className="text-center py-8 text-zinc-400 text-sm bg-white rounded-xl border border-zinc-200">No active members.</div>
                         )}
                       </div>

                       {/* Desktop Table Layout - Active */}
                       <div className="hidden md:block bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left">
                            <thead className="text-xs text-zinc-500 uppercase bg-zinc-50/50 border-b border-zinc-100">
                              <tr>
                                <th className="px-6 py-3 font-semibold">User</th>
                                <th className="px-6 py-3 font-semibold">Role</th>
                                <th className="px-6 py-3 font-semibold">Status</th>
                                <th className="px-6 py-3 font-semibold">Added</th>
                                <th className="px-6 py-3 font-semibold text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-50">
                              {activeMembers.length > 0 ? (
                                activeMembers.map((member) => (
                                  <tr key={member.id} className="hover:bg-zinc-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                       <div className="flex items-center gap-3">
                                          <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-600">
                                             {member.name.charAt(0)}
                                          </div>
                                          <div>
                                            <p className="font-medium text-zinc-900">{member.name}</p>
                                            <p className="text-xs text-zinc-500">{member.email}</p>
                                          </div>
                                       </div>
                                    </td>
                                    <td className="px-6 py-4">
                                       <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                         member.role === 'ADMIN' 
                                           ? 'bg-zinc-900 text-white' 
                                           : 'bg-blue-50 text-blue-700 border border-blue-100'
                                       }`}>
                                         {member.role === 'ADMIN' ? 'Super Admin' : member.role === 'MODERATOR' ? 'Content Manager' : member.role}
                                       </span>
                                    </td>
                                    <td className="px-6 py-4">
                                       <span className="text-xs px-2 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-100">
                                         Active
                                       </span>
                                    </td>
                                    <td className="px-6 py-4 text-zinc-500 text-xs">
                                       {formatMemberDate((member as any).created_at || (member as any).joinedDate)}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                       <button
                                         onClick={() => handleRemoveAdmin(member.id, member.name)}
                                         disabled={isRemovingAdmin === member.id}
                                         className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                       >
                                         {isRemovingAdmin === member.id ? (
                                           <Loader2 size={16} className="animate-spin" />
                                         ) : (
                                           <Trash2 size={16} />
                                         )}
                                       </button>
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={5} className="px-6 py-12 text-center text-zinc-400 text-sm">
                                    No active members.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                     </div>

                     {/* Inactive Members Section (Pending Invitations) */}
                     {inactiveMembers.length > 0 && (
                       <div>
                         <div className="flex items-center gap-2 mb-4">
                           <div className="w-1 h-5 bg-amber-500 rounded-full"></div>
                           <h3 className="text-sm font-bold text-zinc-900">Pending Invitations ({inactiveMembers.length})</h3>
                         </div>
                         
                         {/* Mobile Card Layout - Inactive */}
                         <div className="md:hidden space-y-3">
                           {inactiveMembers.map((member) => (
                             <div key={member.id} className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4 opacity-75">
                               <div className="flex items-start justify-between mb-3">
                                 <div className="flex items-center gap-3 flex-1 min-w-0">
                                   <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-sm font-bold text-zinc-600 flex-shrink-0">
                                     {member.name.charAt(0)}
                                   </div>
                                   <div className="flex-1 min-w-0">
                                     <h4 className="font-medium text-zinc-900 truncate">{member.name}</h4>
                                     <p className="text-xs text-zinc-500 truncate">{member.email}</p>
                                   </div>
                                 </div>
                                 <button
                                   onClick={() => handleRemoveAdmin(member.id, member.name)}
                                   disabled={isRemovingAdmin === member.id}
                                   className="ml-2 p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                 >
                                   {isRemovingAdmin === member.id ? (
                                     <Loader2 size={16} className="animate-spin" />
                                   ) : (
                                     <Trash2 size={16} />
                                   )}
                                 </button>
                               </div>
                               <div className="flex items-center justify-between text-xs">
                                 <div className="flex items-center gap-2 flex-wrap">
                                   <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                     member.role === 'ADMIN' 
                                       ? 'bg-zinc-900 text-white' 
                                       : 'bg-blue-50 text-blue-700 border border-blue-100'
                                   }`}>
                                     {member.role === 'ADMIN' ? 'Super Admin' : member.role === 'MODERATOR' ? 'Content Manager' : member.role}
                                   </span>
                                   <span className="px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-100 text-[10px]">
                                     Pending
                                   </span>
                                 </div>
                                 <span className="text-zinc-400 text-[10px]">
                                   Invited {formatMemberDate((member as any).created_at || (member as any).joinedDate)}
                                 </span>
                               </div>
                             </div>
                           ))}
                         </div>

                         {/* Desktop Table Layout - Inactive */}
                         <div className="hidden md:block bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden opacity-90">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                              <thead className="text-xs text-zinc-500 uppercase bg-zinc-50/50 border-b border-zinc-100">
                                <tr>
                                  <th className="px-6 py-3 font-semibold">User</th>
                                  <th className="px-6 py-3 font-semibold">Role</th>
                                  <th className="px-6 py-3 font-semibold">Status</th>
                                  <th className="px-6 py-3 font-semibold">Invited</th>
                                  <th className="px-6 py-3 font-semibold text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-50">
                                {inactiveMembers.map((member) => (
                                  <tr key={member.id} className="hover:bg-zinc-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                       <div className="flex items-center gap-3">
                                          <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-600">
                                             {member.name.charAt(0)}
                                          </div>
                                          <div>
                                            <p className="font-medium text-zinc-900">{member.name}</p>
                                            <p className="text-xs text-zinc-500">{member.email}</p>
                                          </div>
                                       </div>
                                    </td>
                                    <td className="px-6 py-4">
                                       <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                         member.role === 'ADMIN' 
                                           ? 'bg-zinc-900 text-white' 
                                           : 'bg-blue-50 text-blue-700 border border-blue-100'
                                       }`}>
                                         {member.role === 'ADMIN' ? 'Super Admin' : member.role === 'MODERATOR' ? 'Content Manager' : member.role}
                                       </span>
                                    </td>
                                    <td className="px-6 py-4">
                                       <span className="text-xs px-2 py-1 rounded-full border bg-amber-50 text-amber-700 border-amber-100">
                                         Pending
                                       </span>
                                    </td>
                                    <td className="px-6 py-4 text-zinc-500 text-xs">
                                       {formatMemberDate((member as any).created_at || (member as any).joinedDate)}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                       <button
                                         onClick={() => handleRemoveAdmin(member.id, member.name)}
                                         disabled={isRemovingAdmin === member.id}
                                         className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                       >
                                         {isRemovingAdmin === member.id ? (
                                           <Loader2 size={16} className="animate-spin" />
                                         ) : (
                                           <Trash2 size={16} />
                                         )}
                                       </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                       </div>
                     )}
                   </div>
                 );
               })()}
             </>
           )}

           {/* Invite Modal */}
           {isInviteOpen && mounted && createPortal(
              <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-zinc-900/50 backdrop-blur-sm animate-fade-in">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative animate-slide-up max-h-[90vh] overflow-y-auto">
                  <div className="p-3 sm:p-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50 rounded-t-xl sticky top-0">
                     <h3 className="font-bold text-zinc-900 text-sm sm:text-base">Invite Team Member</h3>
                     <button onClick={() => setIsInviteOpen(false)} className="p-1 text-zinc-400 hover:text-zinc-900 rounded hover:bg-zinc-200">
                       <X size={20} />
                     </button>
                  </div>
                  <form onSubmit={handleInvite} className="p-4 sm:p-6 space-y-4">
                     <div>
                        <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Full Name</label>
                        <input 
                          type="text" 
                          required
                          className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500"
                          value={inviteName}
                          onChange={(e) => setInviteName(e.target.value)}
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Email Address</label>
                        <input 
                          type="email" 
                          required
                          className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Role</label>
                        <CustomSelect 
                          options={roleOptions}
                          value={inviteRole}
                          onChange={setInviteRole}
                        />
                     </div>
                     <button 
                       type="submit"
                       disabled={isInviting}
                       className="w-full py-2.5 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                     >
                       {isInviting ? (
                         <>
                           <Loader2 size={16} className="animate-spin" />
                           Sending...
                         </>
                       ) : (
                         'Send Invitation'
                       )}
                     </button>
                  </form>
                </div>
              </div>,
              document.body
           )}
        </div>
      {removeTeamMemberConfirmation.isOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-zinc-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative animate-slide-up">
            <div className="p-4 sm:p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="p-3 rounded-full bg-red-100 text-red-600">
                  <Trash2 size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-zinc-900 text-lg mb-2">
                    Remove Team Member?
                  </h3>
                  <p className="text-sm text-zinc-600">
                    Are you sure you want to remove <strong>"{removeTeamMemberConfirmation.name}"</strong> from the admin team? This action cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-zinc-100">
                <button
                  onClick={closeRemoveTeamMemberConfirmation}
                  className="flex-1 px-4 py-2.5 bg-white border border-zinc-200 text-zinc-700 font-medium rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRemoveTeamMember}
                  disabled={isRemovingAdmin === removeTeamMemberConfirmation.id}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRemovingAdmin === removeTeamMemberConfirmation.id ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Removing...
                    </>
                  ) : (
                    'Remove Member'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default TeamTab;
