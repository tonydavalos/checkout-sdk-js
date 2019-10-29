import { KlarnaLoadResponse } from './klarna-payments';

/**
 * A set of options that are required to initialize the Klarna payment method.
 *
 * When Klarna is initialized, a widget will be inserted into the DOM. The
 * widget has a list of payment options for the customer to choose from.
 */
export default interface KlarnaV2PaymentInitializeOptions {
    /**
     * The ID of a container which the payment widget should insert into.
     */
    container: string;
    /**
     * The payment_method_category specifies which of Klarna’s customer offerings
     * (Pay now, Pay later or Slice it) that is being shown.
     */
    payment_method_category: string;

    /**
     * A callback that gets called when the widget is loaded and ready to be
     * interacted with.
     *
     * @param response - The result of the initialization. It indicates whether
     * or not the widget is loaded successfully.
     */
    onLoad?(response: KlarnaLoadResponse): void;
}
