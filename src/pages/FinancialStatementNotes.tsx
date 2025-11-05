import PPENote from '@/components/notes/PPENote';
import BorrowingsNote from '@/components/notes/BorrowingsNote';

const FinancialStatementNotes = () => {
  return (
    <div className="space-y-6">
      <PPENote />
      <BorrowingsNote />
      {/* Other notes will be added here in the future */}
    </div>
  );
};

export default FinancialStatementNotes;