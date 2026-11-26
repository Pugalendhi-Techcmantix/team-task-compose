import { Link, useNavigate, useParams } from 'react-router'
import { rolesApi } from '../../api/access'
import { useNotifications } from '../../context/NotificationContext'
import { useFetch } from '../../hooks/useFetch'
import { humanize } from '../../lib/roles'
import { Page } from '../../components/layout/AppLayout'
import { ErrorState, ForbiddenState, LoadingState, PageHeader } from '../../components/ui/States'
import RoleForm from '../../components/access/RoleForm'

export default function RoleFormPage() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const { notify } = useNotifications()

  const data = useFetch(() => (isNew ? Promise.resolve(null) : rolesApi.get(id)), [id])

  const back = () => navigate('/roles')

  const handleSubmit = async (values) => {
    if (isNew) {
      await rolesApi.create(values)
      notify(`Role “${humanize(values.name)}” was created`, { tone: 'success' })
    } else {
      await rolesApi.update(id, values)
      notify('Changes saved', { tone: 'success' })
    }
    back()
  }

  return (
    <Page>
      <Link to="/roles" className="inline-flex items-center rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink-soft transition-colors hover:border-ink/25 hover:text-ink">
        ← Roles
      </Link>
      <div className="mt-6 mb-8">
        <PageHeader
          title={isNew ? 'New role' : humanize(data.data?.name ?? 'Edit role')}
          description={isNew ? 'Name the role and say who it is for.' : 'Changes apply to everyone with this role.'}
        />
      </div>

      {data.status === 'loading' ? (
        <LoadingState />
      ) : data.status === 'error' ? (
        data.errorStatus === 403 ? <ForbiddenState /> : <ErrorState message={data.error} onRetry={data.reload} />
      ) : (
        <RoleForm key={id ?? 'new'} role={data.data} onSubmit={handleSubmit} onCancel={back} />
      )}
    </Page>
  )
}
