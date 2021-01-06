import { Button as ZoteroButton } from 'zotero@components/button';
import { injectIntl } from 'react-intl';

export let Button = injectIntl(ZoteroButton.WrappedComponent);
