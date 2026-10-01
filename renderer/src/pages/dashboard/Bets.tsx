import { useTranslation } from 'react-i18next'
import { BetsTable } from '@/components/shared/BetsTable'
import { PageHeader } from '@/components/shared/PageHeader'
import { mockBets } from '@/lib/mockData'

export default function Bets() {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader title={t('betsPage.title')} description={t('betsPage.description')} />
      <BetsTable data={mockBets} />
    </>
  )
}
