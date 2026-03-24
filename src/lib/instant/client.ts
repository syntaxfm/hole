import { init } from '@instantdb/svelte';
import { PUBLIC_INSTANT_APP_ID } from '$env/static/public';

import schema from '../../instant.schema';

if (!PUBLIC_INSTANT_APP_ID) {
	throw new Error('Missing PUBLIC_INSTANT_APP_ID. Add it to your environment variables.');
}

export const db = init({
	appId: PUBLIC_INSTANT_APP_ID,
	schema
});
