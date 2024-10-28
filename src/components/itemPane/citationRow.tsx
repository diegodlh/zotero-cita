import * as React from "react";
import { useRef, useState, useEffect } from "react";
import ToolbarButton from "./toolbarButton";
import ImportButton from "./importButton";
import LinkButton from "./linkButton";
import WikidataButton from "./wikidataButton";
import ZoteroButton from "./zoteroButton";
import Citation from "../../cita/citation";
import useResizeObserver from "@react-hook/resize-observer";
import { debounce } from "lodash";

interface CitationRowProps {
	citation: Citation;
	citationsLength: number;
	index: number;
	editable: boolean;
	sortBy: string;
	maxLineCount: number;
	containerRef: React.RefObject<HTMLDivElement>;
	handleCitationEdit: (index: number) => void;
	handleCitationDelete: (index: number) => void;
	handleCitationSync: (index: number) => void;
	handleCitationMove: (
		draggedIndex: number,
		destinationIndex: number,
	) => void;
}

function CitationRow(props: CitationRowProps) {
	const {
		citation,
		citationsLength,
		index,
		editable,
		sortBy,
		maxLineCount,
		containerRef,
		handleCitationEdit,
		handleCitationDelete,
		handleCitationSync,
		handleCitationMove,
	} = props;

	const removeStr = Zotero.getString("general.remove");
	const optionsStr = "Open context menu";

	const item = citation.target.item;
	const label = citation.target.getLabel();

	// MARK: Line count handling
	const labelRef = useRef<HTMLSpanElement>(null);
	const [lineCount, setLineCount] = useState(maxLineCount);

	// Event handlers for line count
	const freezeLineCount = () => {
		labelRef.current?.style.setProperty(
			"-webkit-line-clamp",
			lineCount.toString(),
		);
	};

	const resetLineCount = () => {
		labelRef.current?.style.setProperty(
			"-webkit-line-clamp",
			maxLineCount.toString(),
		);
	};

	// Clamp citation labels to maxLineCount lines initially
	useEffect(() => {
		if (labelRef.current) {
			labelRef.current.style.setProperty(
				"-webkit-line-clamp",
				maxLineCount.toString(),
			);
		}
	}, [citation, maxLineCount]);

	// Calculate line counts when component mounts or when dependencies change
	useEffect(calculateLineCount, [citation, maxLineCount]);

	// Recalculate line counts on resize
	useResizeObserver(containerRef, debounce(calculateLineCount, 100));

	function calculateLineCount() {
		if (labelRef.current) {
			const computedStyle = window.getComputedStyle(labelRef.current);
			const lineHeight = parseFloat(computedStyle?.lineHeight || "1");
			const elementHeight = labelRef.current.offsetHeight;
			const calculatedLineCount = Math.round(elementHeight / lineHeight);
			setLineCount(calculatedLineCount);
		}
	}

	// MARK: Drag and drop handling

	const ref = useRef<HTMLDivElement>(null);

	// Drag handlers
	const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
		const row = e.currentTarget;

		if (row.getAttribute("draggable") !== "true") {
			e.preventDefault();
			e.stopPropagation();
			return;
		}

		e.dataTransfer.setData(
			"application/zotero-citation-index",
			index.toString(),
		);
		e.dataTransfer.setDragImage(row, 15, 15);

		setTimeout(() => {
			row.classList.add("drag-hidden-citation");
			row.classList.add("noHover");
		});
	};

	const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		const draggedIndex = parseInt(
			e.dataTransfer.getData("application/zotero-citation-index"),
			10,
		);
		if (isNaN(draggedIndex)) {
			return;
		}

		const placeholder = document.querySelector(".drag-hidden-citation");
		const currentRow = e.currentTarget;

		// Ensure the placeholder isn't in the wrong place
		if (currentRow.previousSibling === placeholder) {
			currentRow.parentNode?.insertBefore(currentRow, placeholder);
		} else if (draggedIndex !== index && placeholder) {
			currentRow.parentNode?.insertBefore(placeholder, currentRow);
		}
	};

	const handleDrop = (e: React.DragEvent<Element>) => {
		e.preventDefault();

		// Get the index of the citation being dragged
		const draggedIndex = parseInt(
			e.dataTransfer.getData("application/zotero-citation-index"),
			10,
		);

		const row = e.currentTarget.closest(".row");

		const destinationIndex = row
			? Array.from(row.parentNode!.children).indexOf(row)
			: citationsLength;

		// No change in order - do nothing
		if (draggedIndex === destinationIndex) {
			return;
		}

		// Due to some kind of drag-drop API issue,
		// after citation is dropped, the hover effect often stays at
		// the row's old location. To workaround that, set noHover class to block all
		// hover effects on citation rows and then remove it on the first mouse movement in refresh().
		document
			.querySelectorAll(".citations-box-list-container .row")
			.forEach((row) => {
				row.classList.add("noHover");
			});
		// Un-hide the moved citation row
		document
			.querySelector(".drag-hidden-citation")
			?.classList.remove("drag-hidden-citation");
		// Update the item after small delay to avoid blinking

		// Update the item after a small delay to avoid blinking
		setTimeout(() => {
			handleCitationMove(draggedIndex, destinationIndex);
		}, 250);
	};

	function renderGrippy() {
		if (sortBy !== "ordinal") return;

		const handleMouseDown = (e: React.MouseEvent) => {
			e.currentTarget.closest(".row")?.setAttribute("draggable", "true");
		};

		const handleMouseUp = (e: React.MouseEvent) => {
			e.currentTarget.closest(".row")?.setAttribute("draggable", "false");
		};

		return (
			<ToolbarButton
				className="zotero-clicky zotero-clicky-grippy show-on-hover"
				tabIndex={-1}
				onMouseDown={handleMouseDown}
				onMouseUp={handleMouseUp}
				title="Drag"
				imgSrc="chrome://zotero/skin/16/universal/grip.svg"
			/>
		);
	}

	return (
		<div
			className="row"
			ref={ref}
			onMouseEnter={freezeLineCount}
			onMouseLeave={resetLineCount}
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDrop={handleDrop}
		>
			{sortBy === "ordinal" && renderGrippy()}
			<div
				className="box keyboard-clickable"
				tabIndex={0}
				role="button"
				onClick={() => handleCitationEdit(index)}
			>
				<span
					className="icon icon-css icon-item-type"
					data-item-type={item.itemType}
				></span>
				<span className="label" ref={labelRef}>
					{label}
				</span>
			</div>
			{editable && (
				<>
					<ImportButton citation={citation} />
					<LinkButton citation={citation} />
					<WikidataButton
						citation={citation}
						onClick={() => handleCitationSync(index)}
					/>
					{/* Remove button */}
					<ToolbarButton
						className="zotero-clicky zotero-clicky-minus show-on-hover no-display"
						tabIndex={0}
						onClick={() => handleCitationDelete(index)}
						title={removeStr}
						imgSrc="chrome://zotero/skin/16/universal/minus-circle.svg"
					/>
					{/* Options button */}
					<ToolbarButton
						className="zotero-clicky zotero-clicky-options show-on-hover no-display"
						tabIndex={0}
						title={optionsStr}
						imgSrc="chrome://zotero/skin/16/universal/options.svg"
					/>
					<ZoteroButton citation={citation} />
				</>
			)}
		</div>
	);
}

export default React.memo(CitationRow);
