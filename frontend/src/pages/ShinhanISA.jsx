import IsaAccountPage from '../components/IsaAccountPage'
import {
  getShinhanISA, createShinhanISA, deleteShinhanISA,
  getShinhanISAHoldings, createShinhanISAHolding, updateShinhanISAHolding, deleteShinhanISAHolding,
  syncISAFromShinhan,
} from '../api'

export default function ShinhanISA() {
  return (
    <IsaAccountPage
      title="신한 ISA"
      subtitle="신한 ISA 보유 종목과 총액을 동기화합니다."
      syncSourceLabel="신한"
      syncErrorLabel="신한 ISA 동기화에 실패했습니다."
      holdingsLabel="신한 ISA 보유 종목"
      getHistory={getShinhanISA}
      createHistory={createShinhanISA}
      deleteHistory={deleteShinhanISA}
      getHoldings={getShinhanISAHoldings}
      createHolding={createShinhanISAHolding}
      updateHolding={updateShinhanISAHolding}
      deleteHolding={deleteShinhanISAHolding}
      syncFromBroker={syncISAFromShinhan}
    />
  )
}
