import { createAction, Action } from '@bigcommerce/data-store';
import { createRequestSender } from '@bigcommerce/request-sender';
import { createScriptLoader } from '@bigcommerce/script-loader';
import { merge, omit } from 'lodash';
import { of, Observable } from 'rxjs';

import { createCheckoutStore, CheckoutRequestSender, CheckoutStore, CheckoutValidator } from '../../../checkout';
import { getCheckoutStoreState } from '../../../checkout/checkouts.mock';
import { MissingDataError } from '../../../common/error/errors';
import { OrderActionCreator, OrderActionType, OrderRequestBody, OrderRequestSender } from '../../../order';
import { OrderFinalizationNotRequiredError } from '../../../order/errors';
import { getOrderRequestBody } from '../../../order/internal-orders.mock';
import { createSpamProtection, SpamProtectionActionCreator } from '../../../order/spam-protection';
import { RemoteCheckoutActionCreator, RemoteCheckoutActionType, RemoteCheckoutRequestSender } from '../../../remote-checkout';
import { PaymentMethodCancelledError, PaymentMethodInvalidError } from '../../errors';
import PaymentMethod from '../../payment-method';
import { getKlarna } from '../../payment-methods.mock';

import KlarnaPayments from './klarna-payments';
import KlarnaV2PaymentStrategy from './klarnav2-payment-strategy';
import KlarnaV2ScriptLoader from './klarnav2-script-loader';
import { getEUBillingAddress, getEUBillingAddressWithNoPhone, getEUShippingAddress, getKlarnaUpdateSessionParams, getKlarnaUpdateSessionParamsPhone } from './klarnav2.mock';

describe('KlarnaV2PaymentStrategy', () => {
    let initializePaymentAction: Observable<Action>;
    let KlarnaPayments: KlarnaPayments;
    let payload: OrderRequestBody;
    let paymentMethod: PaymentMethod;
    let orderActionCreator: OrderActionCreator;
    let remoteCheckoutActionCreator: RemoteCheckoutActionCreator;
    let scriptLoader: KlarnaV2ScriptLoader;
    let submitOrderAction: Observable<Action>;
    let store: CheckoutStore;
    let strategy: KlarnaV2PaymentStrategy;
    let paymentMethodMock: PaymentMethod;

    beforeEach(() => {
        paymentMethodMock = { ...getKlarna(), clientToken: 'foo' };
        store = createCheckoutStore(getCheckoutStoreState());

        jest.spyOn(store, 'dispatch').mockReturnValue(Promise.resolve(store.getState()));
        jest.spyOn(store.getState().paymentMethods, 'getPaymentMethod').mockReturnValue(paymentMethodMock);
        jest.spyOn(store.getState().billingAddress, 'getBillingAddress').mockReturnValue(getEUBillingAddress());
        jest.spyOn(store.getState().shippingAddress, 'getShippingAddress').mockReturnValue( getEUShippingAddress() );

        orderActionCreator = new OrderActionCreator(
            new OrderRequestSender(createRequestSender()),
            new CheckoutValidator(new CheckoutRequestSender(createRequestSender())),
            new SpamProtectionActionCreator(createSpamProtection(createScriptLoader()))
        );
        remoteCheckoutActionCreator = new RemoteCheckoutActionCreator(
            new RemoteCheckoutRequestSender(createRequestSender())
        );
        scriptLoader = new KlarnaV2ScriptLoader(createScriptLoader());
        strategy = new KlarnaV2PaymentStrategy(
            store,
            orderActionCreator,
            remoteCheckoutActionCreator,
            scriptLoader
        );

        KlarnaPayments = {
            authorize: jest.fn((params, data, callback) => {
                params && data ? callback({ approved: true, authorization_token: 'bar' }) :
                    callback({ approved: true, authorization_token: 'bar' });
            }),
            init: jest.fn(() => {}),
            load: jest.fn((_, callback) => callback({ show_form: true })),
        };

        paymentMethod = getKlarna();

        payload = merge({}, getOrderRequestBody(), {
            payment: {
                methodId: paymentMethod.id,
                gatewayId: paymentMethod.gateway,
            },
        });

        initializePaymentAction = of(createAction(RemoteCheckoutActionType.InitializeRemotePaymentRequested));
        submitOrderAction = of(createAction(OrderActionType.SubmitOrderRequested));

        jest.spyOn(store, 'dispatch');

        jest.spyOn(orderActionCreator, 'submitOrder')
            .mockReturnValue(submitOrderAction);

        jest.spyOn(remoteCheckoutActionCreator, 'initializePayment')
            .mockReturnValue(initializePaymentAction);

        jest.spyOn(scriptLoader, 'load')
            .mockImplementation(() => Promise.resolve(KlarnaPayments));

        jest.spyOn(store, 'subscribe');
    });

    describe('#initialize()', () => {
        const onLoad = jest.fn();

        beforeEach(async () => {
            await strategy.initialize({ methodId: paymentMethod.id, klarnav2: { container: '#container', payment_method_category: 'somecategory', onLoad } });
        });

        it('loads script when initializing strategy', () => {
            expect(scriptLoader.load).toHaveBeenCalledTimes(1);
        });

        it('loads store subscribe once', () => {
            expect(store.subscribe).toHaveBeenCalledTimes(1);
        });

        it('loads widget', () => {
            expect(KlarnaPayments.init).toHaveBeenCalledWith({ client_token: 'foo' });
            expect(KlarnaPayments.load)
                .toHaveBeenCalledWith({ container: '#container', payment_method_category: 'somecategory' }, expect.any(Function));
            expect(KlarnaPayments.load).toHaveBeenCalledTimes(1);
        });

        it('triggers callback with response', () => {
            expect(onLoad).toHaveBeenCalledWith({ show_form: true });
        });
    });

    describe('#execute()', () => {
        beforeEach(async () => {
            await strategy.initialize({ methodId: paymentMethod.id, klarnav2: { container: '#container', payment_method_category: 'somecategory' } });
        });

        it('authorizes against klarna', () => {
            strategy.execute(payload);
            expect(KlarnaPayments.authorize).toHaveBeenCalledWith({ payment_method_category: 'klarna' }, getKlarnaUpdateSessionParamsPhone(), expect.any(Function));
        });

        it('loads widget in EU', async () => {
            store = store = createCheckoutStore({
                ...getCheckoutStoreState(),
                billingAddress: { data: getEUBillingAddress(), errors: {}, statuses: {} },
            });
            strategy = new KlarnaV2PaymentStrategy(
                store,
                orderActionCreator,
                remoteCheckoutActionCreator,
                scriptLoader
            );
            jest.spyOn(store, 'dispatch').mockReturnValue(Promise.resolve(store.getState()));
            jest.spyOn(store.getState().paymentMethods, 'getPaymentMethod').mockReturnValue(paymentMethodMock);

            await strategy.initialize({ methodId: paymentMethod.id, klarnav2: { container: '#container', payment_method_category: 'somecategory' } });
            strategy.execute(payload);

            expect(KlarnaPayments.authorize)
                .toHaveBeenCalledWith({ payment_method_category: 'klarna' }, getKlarnaUpdateSessionParamsPhone(), expect.any(Function));
        });

        it('loads widget in EU with no phone', async () => {
            store = store = createCheckoutStore({
                ...getCheckoutStoreState(),
                billingAddress: { data: getEUBillingAddressWithNoPhone(), errors: {}, statuses: {} },
            });
            strategy = new KlarnaV2PaymentStrategy(
                store,
                orderActionCreator,
                remoteCheckoutActionCreator,
                scriptLoader
            );
            jest.spyOn(store, 'dispatch').mockReturnValue(Promise.resolve(store.getState()));
            jest.spyOn(store.getState().paymentMethods, 'getPaymentMethod').mockReturnValue(paymentMethodMock);

            await strategy.initialize({ methodId: paymentMethod.id, klarnav2: { container: '#container', payment_method_category: 'somecategory' } });

            strategy.execute(payload);

            expect(KlarnaPayments.authorize)
                .toHaveBeenCalledWith({ payment_method_category: 'klarna' }, getKlarnaUpdateSessionParams(), expect.any(Function));
        });

        it('throws error if required data is not loaded', async () => {
            store = store = createCheckoutStore({
                ...getCheckoutStoreState(),
                billingAddress: undefined,
            });
            strategy = new KlarnaV2PaymentStrategy(
                store,
                orderActionCreator,
                remoteCheckoutActionCreator,
                scriptLoader
            );

            strategy.initialize({ methodId: paymentMethod.id, klarnav2: { container: '#container', payment_method_category: 'somecategory' } });

            try {
                await strategy.execute(payload);
            } catch (error) {
                expect(error).toBeInstanceOf(MissingDataError);
            }
        });

        it('submits authorization token', async () => {
            await strategy.execute(payload);

            expect(remoteCheckoutActionCreator.initializePayment)
                .toHaveBeenCalledWith('klarna', { authorizationToken: 'bar' });

            expect(orderActionCreator.submitOrder)
                .toHaveBeenCalledWith({ ...payload, payment: omit(payload.payment, 'paymentData'), useStoreCredit: false }, undefined);

            expect(store.dispatch).toHaveBeenCalledWith(initializePaymentAction);
            expect(store.dispatch).toHaveBeenCalledWith(submitOrderAction);
        });

        describe('when klarna authorization is not approved', () => {
            beforeEach(() => {
                KlarnaPayments.authorize = jest.fn(
                    (params, data, callback) => {
                        return params && data ? callback({ approved: false, show_form: true }) :
                            callback({ approved: false, show_form: true });
                    }
                );
            });

            it('rejects the payment execution with cancelled payment error', async () => {
                const rejectedSpy = jest.fn();
                await strategy.execute(payload).catch(rejectedSpy);

                expect(rejectedSpy)
                    .toHaveBeenCalledWith(new PaymentMethodCancelledError());

                expect(orderActionCreator.submitOrder).not.toHaveBeenCalled();
                expect(remoteCheckoutActionCreator.initializePayment)
                    .not.toHaveBeenCalled();
            });
        });

        describe('when klarna authorization fails', () => {
            beforeEach(() => {
                KlarnaPayments.authorize = jest.fn(
                    (params, data, callback) => {
                        return params && data ? callback({ approved: false }) :
                            callback({ approved: false });
                    }
                );
            });

            it('rejects the payment execution with invalid payment error', async () => {
                const rejectedSpy = jest.fn();
                await strategy.execute(payload).catch(rejectedSpy);

                expect(rejectedSpy)
                    .toHaveBeenCalledWith(new PaymentMethodInvalidError());

                expect(orderActionCreator.submitOrder).not.toHaveBeenCalled();
                expect(remoteCheckoutActionCreator.initializePayment)
                    .not.toHaveBeenCalled();
            });
        });
    });

    describe('#finalize()', () => {
        it('throws error to inform that order finalization is not required', async () => {
            try {
                await strategy.finalize();
            } catch (error) {
                expect(error).toBeInstanceOf(OrderFinalizationNotRequiredError);
            }
        });
    });
});
