import { useState } from 'react';
import FranceDepartmentMap from './FranceDepartmentMap.js';

type DepartmentVotes = {
  for: number;
  against: number;
  abstain: number;
  absent: number;
};

type Props = {
  votesByDept: Record<string, DepartmentVotes>;
  deptNames: Record<string, string>;
};

export default function DepartmentMapWrapper({
  votesByDept,
  deptNames,
}: Props) {
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  return (
    <FranceDepartmentMap
      votesByDept={votesByDept}
      deptNames={deptNames}
      selectedDept={selectedDept}
      onSelect={setSelectedDept}
    />
  );
}
