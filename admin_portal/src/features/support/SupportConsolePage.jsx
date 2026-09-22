import SupportCasesPanel from './SupportCasesPanel.jsx';
import {
  FraudSignalQueue,
} from './FraudSignalQueue.jsx';
import {
  SupportTimelineInvestigation,
} from './SupportTimelineInvestigation.jsx';

export function SupportConsolePage() {
  return (
    <div>
      <SupportCasesPanel />

      <div className="my-6 border-t border-gray-200" />

      <FraudSignalQueue />
      <SupportTimelineInvestigation />
    </div>
  );
}
