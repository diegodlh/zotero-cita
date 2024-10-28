// import { Button as ZoteroButton } from "zotero@components/button";
const { ZoteroButton } = ChromeUtils.import_(
	"chrome://zotero/content/components/button.js",
);
// import { injectIntl } from "react-intl";

// export const Button = injectIntl(ZoteroButton.WrappedComponent);
export const Button = ZoteroButton.WrappedComponent;
