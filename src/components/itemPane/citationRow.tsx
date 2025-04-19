import * as React from "react";
import { useRef, useState, useEffect } from "react";
import ToolbarButton from "./toolbarButton";
import ImportButton from "./importButton";
import LinkButton from "./linkButton";
import WikidataButton from "./wikidataButton";
import ZoteroButton from "./zoteroButton";
import { Citation } from "../../cita/citation";
import useResizeObserver from "@react-hook/resize-observer";
import { useInView } from "react-intersection-observer";
import { debounce } from "lodash";
import Wikicite from "../../cita/wikicite";

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
	handleCitationMove: (
		draggedIndex: number,
		destinationIndex: number,
	) => void;
	onCitationPopup: (event: React.MouseEvent, index: number) => void;
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
		handleCitationMove,
		onCitationPopup,
	} = props;

	const removeStr = Zotero.getString("general.remove");
	const optionsStr = Wikicite.getString("wikicite.global.open-context-menu");

	const item = citation.target.item;
	const label = citation.target.getLabel();

	// MARK: Line count handling
	const labelRef = useRef<HTMLSpanElement>(null);
	const [lineCount, setLineCount] = useState(maxLineCount);

	// Apply lineClamp styles via inline style (CSS variables)
	useEffect(() => {
		labelRef.current?.style.setProperty(
			"--hover-line-clamp",
			lineCount.toString(),
		);
	}, [lineCount]);

	useEffect(() => {
		labelRef.current?.style.setProperty(
			"--line-clamp",
			maxLineCount.toString(),
		);
	}, [maxLineCount]);

	// Function to calculate the number of lines in the label element
	// and update the lineCount state accordingly
	function calculateLineCount() {
		if (labelRef.current) {
			const computedStyle = window.getComputedStyle(labelRef.current);
			const lineHeightStr = computedStyle?.lineHeight;
			let lineHeight: number;
			switch (lineHeightStr) {
				case undefined:
				case "normal": {
					// Normal line height is 1.2 times the font size
					const fontSize = parseFloat(
						computedStyle?.fontSize || "16px",
					);
					lineHeight = fontSize * 1.2;
					break;
				}
				default:
					lineHeight = parseFloat(lineHeightStr);
					break;
			}
			const elementHeight = labelRef.current.offsetHeight;
			const calculatedLineCount = Math.round(elementHeight / lineHeight);
			setLineCount(calculatedLineCount); // Update the state with the calculated line count
		}
	}

	// Recalculate line count when the label becomes visible
	const [rowInViewRef, inView, _entry] = useInView({
		/* Optional options */
		threshold: 0.1,
		onChange(inView) {
			if (inView) {
				calculateLineCount();
			}
		},
	});

	// Recalculate line counts on resize
	useResizeObserver(
		containerRef,
		debounce(() => {
			if (inView) {
				calculateLineCount();
			}
		}, 200),
	);

	// MARK: Drag and drop handling

	const [draggable, setDraggable] = useState(false);
	const [isDragging, setIsDragging] = useState(false);

	// Drag handlers
	const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
		if (!draggable) {
			e.preventDefault();
			e.stopPropagation();
			return;
		}

		setIsDragging(true);

		e.dataTransfer.setData(
			"application/zotero-citation-index",
			index.toString(),
		);
		e.dataTransfer.setDragImage(e.currentTarget, 15, 15);
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

		// Update the item after a small delay to avoid blinking
		setTimeout(() => {
			handleCitationMove(draggedIndex, destinationIndex);
		}, 25);
	};

	const handleDragEnd = (e: React.DragEvent<Element>) => {
		e.preventDefault();
		// Un-hide the dragged citation row
		setIsDragging(false);
		setDraggable(false);

		if (
			document.activeElement &&
			typeof (document.activeElement as HTMLElement | XULElement).blur ===
				"function"
		) {
			(document.activeElement as HTMLElement | XULElement).blur();
		}
	};

	function renderGrippy() {
		if (sortBy !== "ordinal") return;

		return (
			<ToolbarButton
				className="zotero-clicky zotero-clicky-grippy show-on-hover"
				tabIndex={-1}
				onMouseDown={() => setDraggable(true)}
				onMouseUp={() => setDraggable(false)}
				title="Drag"
				imgSrc="chrome://zotero/skin/16/universal/grip.svg"
			/>
		);
	}

	return (
		<div
			className={isDragging ? "row drag-hidden-citation noHover" : "row"}
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDrop={handleDrop}
			onDragEnd={handleDragEnd}
			ref={rowInViewRef}
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
						onClick={() => citation.wikidataSync(index)}
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
						onClick={(e) => onCitationPopup(e, index)}
						blurAfterClick={false} // Keep focus on the button when menu opens, but remember to blur it when the menu closes
						imgSrc="chrome://zotero/skin/16/universal/options.svg"
					/>
					<ZoteroButton citation={citation} />
				</>
			)}
		</div>
	);
}

export default React.memo(CitationRow);
