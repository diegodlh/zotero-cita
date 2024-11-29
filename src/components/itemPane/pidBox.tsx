/* License */
import * as React from "react";
import { useEffect, useState, useRef } from "react";
import PIDRow from "../pidRow";
import SourceItemWrapper from "../../cita/sourceItemWrapper";
import PID from "../../cita/PID";

interface PIDBoxProps {
	editable: boolean;
	sourceItem: SourceItemWrapper;
	onPIDChange: (hidden: boolean) => void;
}

function PIDBox(props: PIDBoxProps) {
	const [pidTypes, setPIDTypes] = useState(PID.alwaysShown);

	useEffect(() => {
		setPIDTypes(props.sourceItem.validPIDTypes);
	}, [props.sourceItem]);

	function pidDidChange() {
		const extraPIDsToShow = pidTypes.some(
			(pidType: PIDType) =>
				props.sourceItem.getPID(pidType) == null &&
				!PID.alwaysShown.includes(pidType),
		);
		props.onPIDChange(!extraPIDsToShow);
	}

	return (
		<div className="pid-box">
			<div id="citations-box-pids" className="pid-list">
				{
					// Fixme: to avoid parsing the extra field multiple times
					// (once per non-natively supported pid; e.g., QID, OMID)
					// consider having a pidBox component and
					// redefining Wikicite.getExtraField to allow multiple fieldnames as input
					// and return a fieldName: [values]} object instead
					pidTypes.map((pidType: PIDType) => (
						<PIDRow
							autosave={true}
							editable={props.editable}
							item={props.sourceItem}
							key={pidType}
							type={pidType}
							pidTypes={pidTypes}
							pidDidChange={pidDidChange}
							validate={(type: PIDType, value: string) =>
								props.sourceItem.checkPID(type, value, {
									alert: true,
									// fix: this once we know how
									// parentWindow: window,
								})
							}
						/>
					))
				}
			</div>
		</div>
	);
}

export default PIDBox;
