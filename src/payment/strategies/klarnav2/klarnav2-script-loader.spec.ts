import { createScriptLoader } from '@bigcommerce/script-loader';

import KlarnaV2ScriptLoader from './klarnav2-script-loader';

describe('Klarnav2ScriptLoader', () => {
    const scriptLoader = createScriptLoader();
    const klarnaScriptLoader = new KlarnaV2ScriptLoader(scriptLoader);

    beforeEach(() => {
        jest.spyOn(scriptLoader, 'loadScript').mockReturnValue(Promise.resolve(true));
    });

    it('loads widget script', () => {
        klarnaScriptLoader.load();

        expect(scriptLoader.loadScript).toHaveBeenCalledWith(
            'https://x.klarnacdn.net/kp/lib/v1/api.js'
        );
    });
});
