import { useQuery, useMutation } from 'urql';
import {
  TAGS_QUERY,
  CREATE_TAG_MUTATION,
  DELETE_TAG_MUTATION,
  type Tag,
  type TagsQueryVariables,
  type TagsQueryResult,
  type CreateTagResult,
  type DeleteTagResult,
} from '../api/operations/tags';

type UseTagsOptions = {
  search?: string;
  limit?: number;
};

type UseTagsResult = {
  tags: Tag[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  createTag: (name: string) => Promise<Tag | null>;
  deleteTag: (id: string) => Promise<{ success: boolean; affectedDefinitions: number } | null>;
  creating: boolean;
  deleting: boolean;
};

export function useTags(options: UseTagsOptions = {}): UseTagsResult {
  const variables: TagsQueryVariables = {
    search: options.search || undefined,
    limit: options.limit,
  };

  const [result, reexecuteQuery] = useQuery<TagsQueryResult, TagsQueryVariables>({
    query: TAGS_QUERY,
    variables,
  });

  const [createResult, executeCreate] = useMutation<CreateTagResult>(CREATE_TAG_MUTATION);
  const [deleteResult, executeDelete] = useMutation<DeleteTagResult>(DELETE_TAG_MUTATION);

  const createTag = async (name: string): Promise<Tag | null> => {
    const result = await executeCreate({ name });
    if (result.error) {
      throw new Error(result.error.message);
    }
    // Refetch tags list after creation
    reexecuteQuery({ requestPolicy: 'network-only' });
    return result.data?.createTag ?? null;
  };

  const deleteTag = async (id: string): Promise<{ success: boolean; affectedDefinitions: number } | null> => {
    const result = await executeDelete({ id });
    if (result.error) {
      throw new Error(result.error.message);
    }
    // Refetch tags list after deletion
    reexecuteQuery({ requestPolicy: 'network-only' });
    return result.data?.deleteTag ?? null;
  };

  return {
    tags: result.data?.tags ?? [],
    loading: result.fetching,
    error: result.error ? new Error(result.error.message) : null,
    refetch: () => reexecuteQuery({ requestPolicy: 'network-only' }),
    createTag,
    deleteTag,
    creating: createResult.fetching,
    deleting: deleteResult.fetching,
  };
}
