import ActionListCard from '../components/actions/ActionListCard';
import PossibleCausesCard from '../components/PossibleCausesCard';

type AnalysisDetailProps = {
  analysisId: string;
};

export default function AnalysisDetail({ analysisId }: AnalysisDetailProps) {
  return (
    <div className="analysis-detail">
      {/* ...PossibleCausesCard */}
      <PossibleCausesCard analysisId={analysisId} />
      <ActionListCard analysisId={analysisId} />
      {/* ...remaining cards */}
    </div>
  );
}
