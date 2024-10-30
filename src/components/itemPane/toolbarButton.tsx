import * as React from "react";

interface ToolbarButtonProps {
	className?: string;
	imgSrc?: string;
	title?: string;
	tabIndex?: number;
	blurAfterClick?: boolean;
	onClick?: (event: React.MouseEvent) => void;
	onMouseDown?: (event: React.MouseEvent) => void;
	onMouseUp?: (event: React.MouseEvent) => void;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({
	className,
	imgSrc,
	title,
	tabIndex,
	blurAfterClick = true,
	onClick,
	onMouseDown,
	onMouseUp,
}) => {
	function blurButton() {
		// Reset focus after clicking to remove hover effect
		if (
			document.activeElement &&
			typeof (document.activeElement as HTMLElement | XULElement).blur ===
				"function"
		) {
			(document.activeElement as HTMLElement | XULElement).blur();
		}
	}

	function handleClick(event: React.MouseEvent) {
		if (onClick) {
			onClick(event);
		}
		if (blurAfterClick) {
			blurButton();
		}
	}

	return (
		<div
			className={"toolbarbutton " + className}
			onClick={handleClick}
			tabIndex={tabIndex}
			onMouseDown={onMouseDown}
			onMouseUp={onMouseUp}
			role="button"
		>
			<img
				className="toolbarbutton-icon cita-icon"
				src={imgSrc}
				title={title}
			/>
		</div>
	);
};

export default ToolbarButton;
