export const PREAMBLES_QUERY = `
  query PreamblesForDomainSettings {
    preambles {
      id
      name
      latestVersion {
        id
        version
      }
    }
  }
`;

export type Preamble = {
  id: string;
  name: string;
  latestVersion: { id: string; version: string } | null;
};

export type PreamblesQueryData = {
  preambles: Preamble[];
};
