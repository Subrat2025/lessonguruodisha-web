package java.lang.invoke;

/** Compile-time stub (the SDK's core-lambda-stubs.jar equivalent). Never dexed: D8 desugars lambdas. */
public final class LambdaMetafactory {
    public static final int FLAG_SERIALIZABLE = 1, FLAG_MARKERS = 2, FLAG_BRIDGES = 4;

    public static CallSite metafactory(MethodHandles.Lookup caller, String name, MethodType type,
                                       MethodType samType, MethodHandle impl, MethodType instantiated) {
        throw new UnsupportedOperationException();
    }

    public static CallSite altMetafactory(MethodHandles.Lookup caller, String name, MethodType type, Object... args) {
        throw new UnsupportedOperationException();
    }
}
