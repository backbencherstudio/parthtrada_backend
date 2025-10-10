function serializeBigInt(obj: any): any {
    return JSON.parse(
        JSON.stringify(obj, (_, value) =>
            typeof value === "bigint" ? value.toString() : value
        )
    );
}

export default serializeBigInt;
