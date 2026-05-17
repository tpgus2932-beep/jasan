import { useState } from 'react'
import IsaAccountPage from '../components/IsaAccountPage'
import {
  getISA, createISA, deleteISA,
  getISAHoldings, createISAHolding, updateISAHolding, deleteISAHolding,
  syncISAFromKiwoom,
  getDainISA, createDainISA, deleteDainISA,
  getDainISAHoldings, createDainISAHolding, updateDainISAHolding, deleteDainISAHolding,
  syncDainISAFromKiwoom,
} from '../api'

export default function ISA() {
  const [tab, setTab] = useState('sehyeon')

  return (
    <div>
      <div className="tab-bar">
        <button
          className={`tab-btn${tab === 'sehyeon' ? ' active' : ''}`}
          onClick={() => setTab('sehyeon')}
        >
          👤 김세현
        </button>
        <button
          className={`tab-btn${tab === 'dain' ? ' active' : ''}`}
          onClick={() => setTab('dain')}
        >
          👤 김다인
        </button>
      </div>

      {tab === 'sehyeon' ? (
        <IsaAccountPage
          key="sehyeon"
          title="키움 ISA — 김세현"
          subtitle="김세현 키움 ISA 보유 종목과 총액을 동기화합니다."
          syncSourceLabel="키움"
          syncErrorLabel="키움 ISA 동기화에 실패했습니다."
          holdingsLabel="키움 ISA 보유 종목 (김세현)"
          getHistory={getISA}
          createHistory={createISA}
          deleteHistory={deleteISA}
          getHoldings={getISAHoldings}
          createHolding={createISAHolding}
          updateHolding={updateISAHolding}
          deleteHolding={deleteISAHolding}
          syncFromBroker={syncISAFromKiwoom}
        />
      ) : (
        <IsaAccountPage
          key="dain"
          title="키움 ISA — 김다인"
          subtitle="김다인 키움 ISA 보유 종목과 총액을 동기화합니다."
          syncSourceLabel="키움"
          syncErrorLabel="키움 ISA 동기화에 실패했습니다."
          holdingsLabel="키움 ISA 보유 종목 (김다인)"
          getHistory={getDainISA}
          createHistory={createDainISA}
          deleteHistory={deleteDainISA}
          getHoldings={getDainISAHoldings}
          createHolding={createDainISAHolding}
          updateHolding={updateDainISAHolding}
          deleteHolding={deleteDainISAHolding}
          syncFromBroker={syncDainISAFromKiwoom}
        />
      )}
    </div>
  )
}
