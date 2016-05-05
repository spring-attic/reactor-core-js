import * as rs from "./reactivestreams-spec";
import * as flow from "./reactor-core-flow";
import * as range from "./reactor-core-publisher-range";
import * as subscriber from "./reactor-core-subscriber";

export abstract class Flux<T> implements rs.Publisher<T> {
    
    abstract subscribe(s: rs.Subscriber<T>) : void;
    
    static range(start: number, count: number) : Flux<number> {
        return new range.FluxRange(start, count);
    }
    
    consume(onNext : (t: T) => void, onError? : (t : Error) => void, onComplete? : () => void) : flow.Cancellation {
        const cs = new subscriber.CallbackSubscriber(
            onNext, 
            onError === undefined ? (t: Error) : void => { console.log(t); } : onError,
            onComplete === undefined ? () : void => { } : onComplete);
        this.subscribe(cs);
        return cs;
    }

}