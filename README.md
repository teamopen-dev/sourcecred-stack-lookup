[![Build Status](https://drone.teamopen.dev/api/badges/teamopen-dev/sourcecred-stack-lookup/status.svg)](https://drone.teamopen.dev/teamopen-dev/sourcecred-stack-lookup)
[![license BlueOak-1.0.0](https://badgen.net/badge/license/BlueOak-1.0.0)](LICENSE.md)
[![npm version](https://badgen.net/npm/v/@teamopen/sourcecred-stack-lookup)](https://www.npmjs.com/package/@teamopen/sourcecred-stack-lookup)

# SourceCred stack lookup

Find out how your direct NPM dependencies are doing.

Learn more about SourceCred: https://sourcecred.io/

### Example usage

Install `npm i -D @teamopen/sourcecred-stack-lookup`.

Add a script:

```json
{
  "scripts": {
    "lookup": "sourcecred-stack-lookup"
  }
}
```

Run the lookup `npm run -s lookup`.

### Parameters

ENV vars to tweak:

- `DETAILED=n` [y/n], gives more detail about scores
- `RATING=3` [1,2,3,4], the minimal rating to report.
  Corresponds to 1=Low, 2=Medium, 3=High, 4=CRITICAL.

Example usage in scripts:

```json
{
  "scripts": {
    "lookup": "DETAILED=y RATING=4 sourcecred-stack-lookup"
  }
}
```

Shows detailed information for critical results.
