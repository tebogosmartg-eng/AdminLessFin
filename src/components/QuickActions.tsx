import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { PlusCircle } from 'lucide-react';
import SaleForm from './SaleForm';
import BillForm from './BillForm';
import JournalEntryForm from './JournalEntryForm';

const QuickActions = () => {
  const [isSaleFormOpen, setIsSaleFormOpen] = useState(false);
  const [isBillFormOpen, setIsBillFormOpen] = useState(false);
  const [isJournalEntryFormOpen, setIsJournalEntryFormOpen] = useState(false);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Button onClick={() => setIsSaleFormOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            New Sale
          </Button>
          <Button onClick={() => setIsBillFormOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            New Bill
          </Button>
          <Button onClick={() => setIsJournalEntryFormOpen(true)} variant="outline">
            <PlusCircle className="mr-2 h-4 w-4" />
            New Journal Entry
          </Button>
        </CardContent>
      </Card>

      <SaleForm isOpen={isSaleFormOpen} setIsOpen={setIsSaleFormOpen} />
      <BillForm isOpen={isBillFormOpen} setIsOpen={setIsBillFormOpen} />
      <JournalEntryForm isOpen={isJournalEntryFormOpen} setIsOpen={setIsJournalEntryFormOpen} />
    </>
  );
};

export default QuickActions;