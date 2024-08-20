# db

This library imports the Pool from pg and exports an instance with a connectionString from the DATBASE_URL environment variable. We use CodeArtifact as a private npm registry for the @digital-plant namespace.

`import '@mabulu/db'`

This is a private npm package for use by Mabulu code.

It is hosted by each client's private CodeArtifact store.

If you make changes, then update the version in the package.json and perform `npm publish`.
