/* License */
import * as React from "react";
import PIDRow from "../pidRow";
import PID from "../../cita/PID";
import ItemWrapper from "../../cita/itemWrapper";
import Citation from "../../cita/citation";

interface PIDBoxProps {
	editable: boolean;
	autosave: boolean;
	item: ItemWrapper;
	readonly shownPIDs: Set<PIDType>;
	setShownPIDs: React.Dispatch<React.SetStateAction<Set<PIDType>>>;
	checkPID: (
		type: PIDType,
		value: string,
		options: {
			alert: boolean;
			parentWindow?: Window;
			skipCitation?: Citation;
		},
	) => boolean;
}

function PIDBox(props: PIDBoxProps) {
	// Remove a PID from the list of shown PIDs
	function removePIDRow(pidType: PIDType) {
		if (PID.alwaysShown.has(pidType)) return;
		const newShownPIDs = props.shownPIDs;
		newShownPIDs.delete(pidType);
		props.setShownPIDs(new Set(newShownPIDs));
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
					[...props.shownPIDs].map((pidType: PIDType) => (
						<PIDRow
							autosave={props.autosave}
							editable={props.editable}
							item={props.item}
							key={pidType}
							type={pidType}
							removePIDRow={removePIDRow}
							validate={(type: PIDType, value: string) =>
								props.checkPID(type, value, {
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
