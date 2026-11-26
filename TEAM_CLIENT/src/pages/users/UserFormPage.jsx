import { Link, useNavigate, useParams } from 'react-router'
import { usersApi, rolesApi } from '../../api/access'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationContext'
import { useFetch } from '../../hooks/useFetch'
import { Page } from '../../components/layout/AppLayout'
import { ErrorState, ForbiddenState, LoadingState, PageHeader } from '../../components/ui/States'
import UserForm from '../../components/access/UserForm'

export default function UserFormPage() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const { user: me, refreshUser } = useAuth()
  const { notify } = useNotifications()

  const data = useFetch(async () => {
    const [roles, user] = await Promise.all([rolesApi.list(), isNew ? null : usersApi.get(id)])
    return { roles: roles.items, user }
  }, [id])

  const back = () => navigate('/users')

  const handleSubmit = async (values) => {
    if (isNew) {
      await usersApi.create(values)
      notify(`${values.name} was added`, { tone: 'success' })
    } else {
      await usersApi.update(id, values)
      notify('Changes saved', { tone: 'success' })
      // your own name / roles may have changed → refresh the header
      if (String(id) === String(me?.id)) await refreshUser().catch(() => {})
    }
    back()
  }

  return (
    <Page>
      <Link to="/users" className="inline-flex items-center rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink-soft transition-colors hover:border-ink/25 hover:text-ink">
        ← Users
      </Link>
      <div className="mt-6 mb-8">
        <PageHeader
          title={isNew ? 'New user' : data.data?.user?.name ?? 'Edit user'}
          description={isNew ? 'Give someone access and choose their role.' : data.data?.user?.email}
        />
      </div>

      {data.status === 'loading' ? (
        <LoadingState />
      ) : data.status === 'error' ? (
        data.errorStatus === 403 ? <ForbiddenState /> : <ErrorState message={data.error} onRetry={data.reload} />
      ) : (
        <UserForm key={id ?? 'new'} user={data.data.user} roles={data.data.roles} onSubmit={handleSubmit} onCancel={back} />
      )}
    </Page>
  )
}
