import React, { useState, useEffect, useCallback } from 'react';
import Dialog from '../../components/Dialog';
import { Search, CheckCircle, Crown, Ban, Loader2, X } from 'lucide-react';
import CustomSelect, { Option } from '../../components/CustomSelect';
import { useToast } from '../../context/ToastContext';
import { User } from '../../types';
import { adminAPI } from '../../services/api';
import { StudentsTableSkeleton } from './skeletons';

const PAGE_SIZE = 20;

// Students management tab (extracted from Admin.tsx): server-side search,
// plan/status filters, pagination, premium toggle, ban/activate.
// Self-contained (mirrors AuditTab): the shared DataContext user list is a
// bare first-50 fetch, so filtering it locally made every student past row
// 50 invisible and unreachable.
const StudentsTab: React.FC = () => {
  const { addToast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  // Debounced: the fetch effect fires per value, so raw keystrokes would
  // spam a request per character.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(t);
  }, [searchTerm]);
  const [planFilter, setPlanFilter] = useState<'all' | 'free' | 'premium'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Active' | 'Banned'>('all');
  const [claims, setClaims] = useState<any[] | null>(null);
  const [isDecidingClaim, setIsDecidingClaim] = useState<string | null>(null);
  // Referral rewards queue — same approve/reject shape as payment claims,
  // except Approve hits its own endpoint (stacks +1 Pro month server-side).
  const [refRewards, setRefRewards] = useState<any[] | null>(null);
  const [isDecidingReward, setIsDecidingReward] = useState<string | null>(null);
  const [students, setStudents] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [pagination, setPagination] = useState({ total: 0, limit: PAGE_SIZE, offset: 0, hasMore: false });
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    type: 'upgrade' | 'downgrade' | 'activate' | 'ban' | null;
    studentId: string | null;
    studentName: string | null;
    currentStatus?: string;
    isPremium?: boolean;
  }>({
    isOpen: false,
    type: null,
    studentId: null,
    studentName: null
  });

  const planOptions: Option[] = [
    { label: 'All Plans', value: 'all' },
    { label: 'Free', value: 'free' },
    { label: 'Pro', value: 'premium' }
  ];
  const statusOptions: Option[] = [
    { label: 'All Statuses', value: 'all' },
    { label: 'Active', value: 'Active' },
    { label: 'Banned', value: 'Banned' }
  ];

  const fetchStudents = useCallback(async (opts?: { offset?: number }) => {
    try {
      setUsersLoading(true);
      const offset = opts?.offset ?? 0;
      const result = await adminAPI.getUsers({
        limit: PAGE_SIZE,
        offset,
        role: 'STUDENT',
        search: debouncedSearch.trim() || undefined,
        plan: planFilter === 'all' ? undefined : planFilter,
        status: statusFilter === 'all' ? undefined : statusFilter
      });
      setStudents(result.users || []);
      setPagination(result.pagination || { total: 0, limit: PAGE_SIZE, offset, hasMore: false });
    } catch (error: any) {
      console.error('Failed to fetch students:', error);
      addToast('Failed to load students', 'error');
    } finally {
      setUsersLoading(false);
    }
  }, [addToast, debouncedSearch, planFilter, statusFilter]);

  // Refetch from page one whenever search/filters change; pager drives offsets.
  useEffect(() => {
    fetchStudents({ offset: 0 });
  }, [fetchStudents]);

  // Payment claims queue: identity-linked at claim time, so approval needs
  // no Telegram-to-email matching. Silent-fail to hidden (old DBs).
  const fetchClaims = useCallback(async () => {
    try {
      const rows = await adminAPI.getPaymentClaims();
      setClaims(rows);
    } catch {
      setClaims(null);
    }
  }, []);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  // Approve = the existing premium toggle (auto-settles the claim
  // server-side). Reject = explicit no. Both refresh the queue + list.
  const decideClaim = async (claim: any, approve: boolean) => {
    try {
      setIsDecidingClaim(claim.id);
      if (approve) {
        await adminAPI.updateUserPremium(claim.user_id, true);
        addToast(`${claim.name} upgraded to Pro`, 'success');
      } else {
        await adminAPI.rejectPaymentClaim(claim.id);
        addToast('Claim rejected', 'success');
      }
      await Promise.all([fetchClaims(), fetchStudents()]);
    } catch (error: any) {
      addToast(error?.message || 'Failed to decide claim', 'error');
    } finally {
      setIsDecidingClaim(null);
    }
  };

  // Referral rewards queue: referees arrive linked (verify-time), so the
  // review is right here — same-date bursts and lookalike emails are the
  // fraud tells. Approve stacks +1 Pro month; reject releases the 5 back.
  // Silent-fail to hidden (old DBs).
  const fetchRefRewards = useCallback(async () => {
    try {
      const rows = await adminAPI.getReferralRewards();
      setRefRewards(rows);
    } catch {
      setRefRewards(null);
    }
  }, []);

  useEffect(() => {
    fetchRefRewards();
  }, [fetchRefRewards]);

  const decideReward = async (reward: any, approve: boolean) => {
    try {
      setIsDecidingReward(reward.id);
      if (approve) {
        await adminAPI.approveReferralReward(reward.id);
        addToast(`${reward.name} earned 1 month of Pro`, 'success');
      } else {
        await adminAPI.rejectReferralReward(reward.id);
        addToast('Reward rejected — referees released back', 'success');
      }
      await Promise.all([fetchRefRewards(), fetchStudents()]);
    } catch (error: any) {
      addToast(error?.message || 'Failed to decide reward', 'error');
    } finally {
      setIsDecidingReward(null);
    }
  };

  const hasActiveFilters = debouncedSearch.trim() !== '' || planFilter !== 'all' || statusFilter !== 'all';

  // joinedDate is optional — never render "Invalid Date"
  const formatJoined = (value?: string): string => {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const openStatusConfirmation = (student: any) => {
    const currentStatus = student.status || 'Active';
    const isActive = currentStatus === 'Active';
    setConfirmationModal({
      isOpen: true,
      type: isActive ? 'ban' : 'activate',
      studentId: student.id,
      studentName: student.name,
      currentStatus: currentStatus
    });
  };

  const openPremiumConfirmation = (student: any) => {
    setConfirmationModal({
      isOpen: true,
      type: student.isPremium ? 'downgrade' : 'upgrade',
      studentId: student.id,
      studentName: student.name,
      isPremium: student.isPremium
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmationModal.studentId || !confirmationModal.type) return;

    setIsConfirmingAction(true);
    try {
      if (confirmationModal.type === 'upgrade' || confirmationModal.type === 'downgrade') {
        // Premium toggle
        await adminAPI.updateUserPremium(confirmationModal.studentId, confirmationModal.type === 'upgrade');
        await fetchStudents({ offset: pagination.offset });
        addToast(
          confirmationModal.type === 'upgrade'
            ? 'User upgraded to Premium Plan'
            : 'User downgraded to Free Plan',
          'success'
        );
      } else if (confirmationModal.type === 'ban' || confirmationModal.type === 'activate') {
        // Status toggle
        const newStatus = confirmationModal.type === 'ban' ? 'Banned' : 'Active';
        await adminAPI.updateUserStatus(confirmationModal.studentId, newStatus);
        await fetchStudents({ offset: pagination.offset });
        addToast(
          `User marked as ${newStatus}`,
          newStatus === 'Active' ? 'success' : 'warning'
        );
      }

      // Close modal
      setConfirmationModal({
        isOpen: false,
        type: null,
        studentId: null,
        studentName: null
      });
    } catch (error: any) {
      addToast(error.message || 'Failed to update user', 'error');
    } finally {
      setIsConfirmingAction(false);
    }
  };

  const closeConfirmationModal = () => {
    setConfirmationModal({
      isOpen: false,
      type: null,
      studentId: null,
      studentName: null
    });
  };

  return (
    <>
        <div className="space-y-4 sm:space-y-6 animate-fade-in">
           <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3 bg-surface p-3 sm:p-4 rounded-xl border border-zinc-200 shadow-sm">
              <h2 className="text-base sm:text-lg font-bold text-ink">Student Management</h2>
              <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
                <div className="relative flex-1 sm:flex-initial">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search name or email..."
                    aria-label="Search students by name or email"
                    className="pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-400 transition-all w-full sm:w-64"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="w-full sm:w-36">
                  <CustomSelect
                    options={planOptions}
                    value={planFilter}
                    onChange={(value) => setPlanFilter(value as 'all' | 'free' | 'premium')}
                  />
                </div>
                <div className="w-full sm:w-40">
                  <CustomSelect
                    options={statusOptions}
                    value={statusFilter}
                    onChange={(value) => setStatusFilter(value as 'all' | 'Active' | 'Banned')}
                  />
                </div>
               </div>
            </div>

            {/* Payment claims queue — pending first. Identity is linked at
                claim time: approve upgrades (auto-settles), reject says no. */}
            {claims !== null && claims.some((c: any) => c.status === 'pending') && (
              <div className="bg-surface rounded-xl border border-amber-200 shadow-sm p-4 sm:p-5">
                <h3 className="font-bold text-ink text-sm sm:text-base mb-1">
                  Pending payments <span className="text-xs font-medium text-zinc-500">({claims.filter((c: any) => c.status === 'pending').length} waiting)</span>
                </h3>
                <p className="text-xs text-zinc-500 mb-3">Verify the Telebirr receipt, then approve — the upgrade settles the ticket automatically.</p>
                <div className="space-y-2">
                  {claims.filter((c: any) => c.status === 'pending').map((c: any) => (
                    <div key={c.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 bg-zinc-50 border border-zinc-200 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-ink truncate">{c.name}</p>
                        <p className="text-[11px] text-zinc-500 truncate">
                          {c.email}
                          {c.transaction_ref ? ` · ref ${c.transaction_ref}` : ''}
                          {' · '}{new Date(c.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => decideClaim(c, true)}
                          disabled={isDecidingClaim === c.id}
                          className="flex-1 sm:flex-none px-3 py-1.5 bg-zinc-900 text-onink text-xs font-medium rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
                        >
                          {isDecidingClaim === c.id ? 'Working…' : 'Approve'}
                        </button>
                        <button
                          onClick={() => decideClaim(c, false)}
                          disabled={isDecidingClaim === c.id}
                          className="flex-1 sm:flex-none px-3 py-1.5 bg-surface border border-zinc-200 text-zinc-500 text-xs font-medium rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Referral rewards queue — pending first. Approve stacks +1 Pro
                month; reject releases the referees back. Referee emails render
                inline so fraud review (bursts, lookalikes) needs no clicks. */}
            {refRewards !== null && refRewards.some((r: any) => r.status === 'pending') && (
              <div className="bg-surface rounded-xl border border-emerald-200 shadow-sm p-4 sm:p-5">
                <h3 className="font-bold text-ink text-sm sm:text-base mb-1">
                  Referral rewards <span className="text-xs font-medium text-zinc-500">({refRewards.filter((r: any) => r.status === 'pending').length} waiting)</span>
                </h3>
                <p className="text-xs text-zinc-500 mb-3">Check the 5 referees look real (verified, spread over days), then approve — +1 Pro month stacks automatically.</p>
                <div className="space-y-2">
                  {refRewards.filter((r: any) => r.status === 'pending').map((r: any) => (
                    <div key={r.id} className="flex flex-col gap-2 p-3 bg-zinc-50 border border-zinc-200 rounded-lg">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-ink truncate">{r.name}</p>
                          <p className="text-[11px] text-zinc-500 truncate">
                            {r.email}
                            {' · '}{new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            {r.is_premium ? ' · already Pro (stacks)' : ''}
                          </p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => decideReward(r, true)}
                            disabled={isDecidingReward === r.id}
                            className="flex-1 sm:flex-none px-3 py-1.5 bg-zinc-900 text-onink text-xs font-medium rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
                          >
                            {isDecidingReward === r.id ? 'Working…' : 'Approve +1 mo'}
                          </button>
                          <button
                            onClick={() => decideReward(r, false)}
                            disabled={isDecidingReward === r.id}
                            className="flex-1 sm:flex-none px-3 py-1.5 bg-surface border border-zinc-200 text-zinc-500 text-xs font-medium rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                      {(r.referees?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {r.referees.map((f: any, i: number) => (
                            <span
                              key={i}
                              title={`${f.name || ''} · verified ${f.qualified_at ? new Date(f.qualified_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}${f.status && f.status !== 'Active' ? ` · ${f.status}` : ''}`}
                              className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${
                                f.status && f.status !== 'Active'
                                  ? 'bg-red-50 text-red-600 border-red-200'
                                  : 'bg-surface text-zinc-500 border-zinc-200'
                              }`}
                            >
                              {f.email}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {usersLoading ? (
             <StudentsTableSkeleton />
           ) : (
             <>
               {/* Mobile Card Layout */}
               <div className="md:hidden space-y-3">
                 {students.map((student) => (
                   <div key={student.id} className="bg-surface rounded-xl border border-zinc-200 shadow-sm p-4">
                     <div className="flex items-start justify-between mb-3">
                       <div className="flex-1 min-w-0">
                         <h4 className="font-medium text-ink truncate">{student.name}</h4>
                         <p className="text-xs text-zinc-500 truncate">{student.email}</p>
                       </div>
                       <button 
                         onClick={() => openStatusConfirmation(student)}
                         className={`ml-2 p-2 rounded-lg transition-colors ${
                           (student.status === 'Active' || !student.status) ? 'text-zinc-400 hover:text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'
                         }`}
                       >
                         {(student.status === 'Active' || !student.status) ? <Ban size={16} /> : <CheckCircle size={16} />}
                       </button>
                     </div>
                     <div className="flex items-center justify-between gap-2 text-xs">
                       <div className="flex items-center gap-2">
                         <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium border text-[10px] ${
                           (student.status === 'Active' || !student.status) ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'
                         }`}>
                           <span className={`w-1 h-1 rounded-full ${(student.status === 'Active' || !student.status) ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                           {student.status || 'Active'}
                         </span>
                         {student.isPremium ? (
                           <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100 flex items-center gap-1">
                             <Crown size={10} /> PRO
                           </span>
                         ) : (
                           <span className="text-[10px] text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">Free</span>
                         )}
                       </div>
                       <button 
                         onClick={() => openPremiumConfirmation(student)}
                         className="text-[10px] font-medium text-zinc-500 hover:text-amber-600 hover:underline"
                       >
                         {student.isPremium ? 'Downgrade' : 'Upgrade'}
                       </button>
                     </div>
                      <div className="mt-2 text-[10px] text-zinc-400">
                        Joined {formatJoined(student.joinedDate)}
                      </div>
                   </div>
                 ))}
                 {students.length === 0 && (
                   <div className="text-center py-12 text-zinc-400 text-sm">
                     {hasActiveFilters ? 'No students match your search or filters.' : 'No students found.'}
                   </div>
                 )}
               </div>

               {/* Desktop Table Layout */}
               <div className="hidden md:block bg-surface rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-zinc-500 uppercase bg-zinc-50/50 border-b border-zinc-100">
                      <tr>
                        <th className="px-6 py-3 font-semibold">Name</th>
                        <th className="px-6 py-3 font-semibold">Status</th>
                        <th className="px-6 py-3 font-semibold">Plan</th>
                        <th className="px-6 py-3 font-semibold">Joined</th>
                        <th className="px-6 py-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                      {students.map((student) => (
                      <tr key={student.id} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-6 py-4">
                           <div>
                             <p className="font-medium text-ink">{student.name}</p>
                             <p className="text-xs text-zinc-500">{student.email}</p>
                           </div>
                        </td>
                        <td className="px-6 py-4">
                           <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                             (student.status === 'Active' || !student.status) ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'
                           }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${(student.status === 'Active' || !student.status) ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                              {student.status || 'Active'}
                           </span>
                        </td>
                        <td className="px-6 py-4">
                           {student.isPremium ? (
                             <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100 flex items-center gap-1 w-fit">
                               <Crown size={12} /> PRO
                             </span>
                           ) : (
                             <span className="text-xs text-zinc-500 bg-zinc-100 px-2 py-1 rounded border border-zinc-200">Free</span>
                           )}
                        </td>
                        <td className="px-6 py-4 text-zinc-500 text-xs">
                           {formatJoined(student.joinedDate)}
                        </td>
                        <td className="px-6 py-4 text-right">
                           <div className="flex justify-end items-center gap-2">
                              <button 
                                onClick={() => openPremiumConfirmation(student)}
                                className="text-xs font-medium text-zinc-500 hover:text-amber-600 hover:underline"
                              >
                                {student.isPremium ? 'Downgrade' : 'Upgrade'}
                              </button>
                              <div className="h-4 w-px bg-zinc-200"></div>
                              <button 
                                onClick={() => openStatusConfirmation(student)}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  (student.status === 'Active' || !student.status) ? 'text-zinc-400 hover:text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'
                                }`}
                                title={(student.status === 'Active' || !student.status) ? 'Ban User' : 'Activate User'}
                              >
                                {(student.status === 'Active' || !student.status) ? <Ban size={16} /> : <CheckCircle size={16} />}
                              </button>
                           </div>
                        </td>
                      </tr>
                      ))}
                      {students.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-zinc-400 text-sm">
                            {hasActiveFilters ? 'No students match your search or filters.' : 'No students found.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination footer */}
              <div className="bg-surface rounded-xl border border-zinc-200 shadow-sm px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between text-xs text-zinc-500">
                <div>
                  Showing <span className="font-medium text-inksoft">{students.length}</span> of{' '}
                  <span className="font-medium text-inksoft">{pagination.total}</span> students
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => fetchStudents({ offset: Math.max(0, pagination.offset - pagination.limit) })}
                    disabled={usersLoading || pagination.offset === 0}
                    className="px-3 py-2 bg-surface border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => fetchStudents({ offset: pagination.offset + pagination.limit })}
                    disabled={usersLoading || !pagination.hasMore}
                    className="px-3 py-2 bg-surface border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
             </>
           )}
        </div>
      <Dialog
        open={confirmationModal.isOpen && mounted}
        onClose={closeConfirmationModal}
        label={
          confirmationModal.type === 'upgrade' ? 'Upgrade to Premium?' :
          confirmationModal.type === 'downgrade' ? 'Downgrade to Free Plan?' :
          confirmationModal.type === 'ban' ? 'Ban User?' :
          confirmationModal.type === 'activate' ? 'Activate User?' : 'Confirm action'
        }
      >
            <div className="p-4 sm:p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className={`p-3 rounded-full ${
                  confirmationModal.type === 'ban' 
                    ? 'bg-red-100 text-red-600' 
                    : confirmationModal.type === 'activate'
                    ? 'bg-emerald-100 text-emerald-600'
                    : confirmationModal.type === 'upgrade'
                    ? 'bg-amber-100 text-amber-600'
                    : 'bg-zinc-100 text-inksoft'
                }`}>
                  {confirmationModal.type === 'ban' && <Ban size={24} />}
                  {confirmationModal.type === 'activate' && <CheckCircle size={24} />}
                  {confirmationModal.type === 'upgrade' && <Crown size={24} />}
                  {confirmationModal.type === 'downgrade' && <X size={24} />}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-ink text-lg mb-2">
                    {confirmationModal.type === 'upgrade' && 'Upgrade to Premium?'}
                    {confirmationModal.type === 'downgrade' && 'Downgrade to Free Plan?'}
                    {confirmationModal.type === 'ban' && 'Ban User?'}
                    {confirmationModal.type === 'activate' && 'Activate User?'}
                  </h3>
                  <p className="text-sm text-inksoft">
                    {confirmationModal.type === 'upgrade' && (
                      <>Are you sure you want to upgrade <strong>{confirmationModal.studentName}</strong> to Premium Plan? They will gain access to all premium content.</>
                    )}
                    {confirmationModal.type === 'downgrade' && (
                      <>Are you sure you want to downgrade <strong>{confirmationModal.studentName}</strong> to Free Plan? They will lose access to premium content.</>
                    )}
                    {confirmationModal.type === 'ban' && (
                      <>Are you sure you want to ban <strong>{confirmationModal.studentName}</strong>? They will not be able to access the platform.</>
                    )}
                    {confirmationModal.type === 'activate' && (
                      <>Are you sure you want to activate <strong>{confirmationModal.studentName}</strong>? They will regain access to the platform.</>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-zinc-100">
                <button
                  onClick={closeConfirmationModal}
                  className="flex-1 px-4 py-2.5 bg-surface border border-zinc-200 text-inksoft font-medium rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmAction}
                  disabled={isConfirmingAction}
                  className={`flex-1 px-4 py-2.5 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    confirmationModal.type === 'ban'
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : confirmationModal.type === 'activate'
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : confirmationModal.type === 'upgrade'
                      ? 'bg-amber-600 text-white hover:bg-amber-700'
                      : 'bg-zinc-600 text-onink hover:bg-zinc-700'
                  }`}
                >
                  {isConfirmingAction ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      {confirmationModal.type === 'upgrade' && 'Upgrading...'}
                      {confirmationModal.type === 'downgrade' && 'Downgrading...'}
                      {confirmationModal.type === 'ban' && 'Banning...'}
                      {confirmationModal.type === 'activate' && 'Activating...'}
                    </>
                  ) : (
                    <>
                      {confirmationModal.type === 'upgrade' && 'Upgrade'}
                      {confirmationModal.type === 'downgrade' && 'Downgrade'}
                      {confirmationModal.type === 'ban' && 'Ban User'}
                      {confirmationModal.type === 'activate' && 'Activate'}
                    </>
                  )}
                </button>
              </div>
            </div>
      </Dialog>
    </>
  );
};

export default StudentsTab;
