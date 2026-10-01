import { BetsTable } from '@/components/shared/BetsTable'
import { PageHeader } from '@/components/shared/PageHeader'
import { mockBets } from '@/lib/mockData'

export default function Bets() {
  return (
    <>
      <PageHeader title="Bets" description="Captured and executed bet log." />
      <BetsTable data={mockBets} />
    </>
  )
}
