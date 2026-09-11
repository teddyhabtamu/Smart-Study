import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, CheckCircle, Crown, Ban, Loader2, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { UserRole } from '../../types';
import { adminAPI } from '../../services/api';
import { StudentsTableSkeleton } from './skeletons';

// Students management tab (extracted from Admin.tsx): search, premium
// toggle, ban/activate. Owns its search + confirmation state.
const StudentsTab: React.FC = () => {
  const { allUsers, fetchUsers, loading } = useData();
  const { addToast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
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

  const filteredStudents = allUsers.filter(s => s.role === UserRole.STUDENT && ((s.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || (s.email?.toLowerCase() || '').includes(searchTerm.toLowerCase())));

  // joinedDate is optional — never render "Invalid Date"
  const formatJoined = (value?: string): string => {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
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
        await fetchUsers();
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
        await fetchUsers();
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
           <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white p-3 sm:p-4 rounded-xl border border-zinc-200 shadow-sm">
              <h2 className="text-base sm:text-lg font-bold text-zinc-900">Student Management</h2>
              <div className="relative w-full sm:w-auto">
                 <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                 <input 
                   type="text" 
                   placeholder="Search students..." 
                   className="pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-400 transition-all w-full sm:w-64"
                   value={searchTerm}
                   onChange={(e) => setSearchTerm(e.target.value)}
                 />
              </div>
           </div>

           {loading.users ? (
             <StudentsTableSkeleton />
           ) : (
             <>
               {/* Mobile Card Layout */}
               <div className="md:hidden space-y-3">
                 {filteredStudents.map((student) => (
                   <div key={student.id} className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4">
                     <div className="flex items-start justify-between mb-3">
                       <div className="flex-1 min-w-0">
                         <h4 className="font-medium text-zinc-900 truncate">{student.name}</h4>
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
                 {filteredStudents.length === 0 && (
                   <div className="text-center py-12 text-zinc-400 text-sm">No students found.</div>
                 )}
               </div>

               {/* Desktop Table Layout */}
               <div className="hidden md:block bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
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
                      {filteredStudents.map((student) => (
                      <tr key={student.id} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-6 py-4">
                           <div>
                             <p className="font-medium text-zinc-900">{student.name}</p>
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
                      {filteredStudents.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-zinc-400 text-sm">
                            No students found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
             </>
           )}
        </div>
      {confirmationModal.isOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-zinc-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative animate-slide-up">
            <div className="p-4 sm:p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className={`p-3 rounded-full ${
                  confirmationModal.type === 'ban' 
                    ? 'bg-red-100 text-red-600' 
                    : confirmationModal.type === 'activate'
                    ? 'bg-emerald-100 text-emerald-600'
                    : confirmationModal.type === 'upgrade'
                    ? 'bg-amber-100 text-amber-600'
                    : 'bg-zinc-100 text-zinc-600'
                }`}>
                  {confirmationModal.type === 'ban' && <Ban size={24} />}
                  {confirmationModal.type === 'activate' && <CheckCircle size={24} />}
                  {confirmationModal.type === 'upgrade' && <Crown size={24} />}
                  {confirmationModal.type === 'downgrade' && <X size={24} />}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-zinc-900 text-lg mb-2">
                    {confirmationModal.type === 'upgrade' && 'Upgrade to Premium?'}
                    {confirmationModal.type === 'downgrade' && 'Downgrade to Free Plan?'}
                    {confirmationModal.type === 'ban' && 'Ban User?'}
                    {confirmationModal.type === 'activate' && 'Activate User?'}
                  </h3>
                  <p className="text-sm text-zinc-600">
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
                  className="flex-1 px-4 py-2.5 bg-white border border-zinc-200 text-zinc-700 font-medium rounded-lg hover:bg-zinc-50 transition-colors"
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
                      : 'bg-zinc-600 text-white hover:bg-zinc-700'
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
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default StudentsTab;
