import { useNavigate } from 'react-router-dom';
import { DefinitionList } from '../components/definitions/DefinitionList';
import { useDefinitions } from '../hooks/useDefinitions';

export function Definitions() {
  const navigate = useNavigate();
  const { definitions, loading, error } = useDefinitions({ rootOnly: true });

  const handleCreateNew = () => {
    navigate('/definitions/new');
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">
        Definitions
      </h1>
      <DefinitionList
        definitions={definitions}
        loading={loading}
        error={error}
        onCreateNew={handleCreateNew}
      />
    </div>
  );
}
