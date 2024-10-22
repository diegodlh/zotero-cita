import * as React from "react";

interface ToolbarButtonProps {
	className?: string;
	imgSrc?: string;
	title?: string;
	tabIndex?: number;
	onClick?: (event: React.MouseEvent) => void;
	onMouseDown?: (event: React.MouseEvent) => void;
	onMouseUp?: (event: React.MouseEvent) => void;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({
	className,
	imgSrc,
	title,
	tabIndex,
	onClick,
	onMouseDown,
	onMouseUp,
}) => {
	return (
		<div
			className={"toolbarbutton " + className}
			onClick={onClick}
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
