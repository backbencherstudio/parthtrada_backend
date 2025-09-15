const text = `<think>
Okay, let's see. The user's query is "Find experts with Machine Learning skills on 20 September 2025." I need to determine the intent and extract parameters if possible.

First, looking at the intents available: FAQ, Booking, Reviews, Payments, or Unknown. Since the query seems to involve finding experts who have a specific skill (Machine Learning) on a particular date, that sounds like a booking scenario where they want someone with a certain expertise to attend an event.

So, the intent should be "Booking". Now, looking for parameters. The user mentions "with Machine Learning skills" which indicates a required skill. That makes sense as a "Skill" parameter. Additionally, the date is 20 September 2025, so that's the date they're interested in.

I don't see any mention of reviews or payments here, and since there's no unknown intent involved, I can omit parameters for other intents. Therefore, the response should list the "Skill" as Machine Learning and include the specific date.
</think>

{"intent":"Booking","parameters":{"skill":"Machine Learning","date":"20 September 2025"}}

The user is seeking an expert with Machine Learning skills on a specified date, which fits the "Booking" intent with the required skill and the given date.`;

const jsonMatches = text.match(/\{[\s\S]*?\}/g);
let jsonString = '';
if (jsonMatches && jsonMatches.length > 0) {
  jsonString = jsonMatches[jsonMatches.length - 1];
}
console.log(JSON.parse(jsonString + '}'));
