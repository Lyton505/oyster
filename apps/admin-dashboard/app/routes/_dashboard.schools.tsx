import {
  type ActionFunctionArgs,
  json,
  type LoaderFunctionArgs,
  type SerializeFrom,
} from '@remix-run/node';
import { Link, Outlet, useLoaderData } from '@remix-run/react';
import { sql } from 'kysely';
import { useState } from 'react';
import { BookOpen, Edit, Menu, Plus } from 'react-feather';
import { generatePath } from 'react-router';
import { match } from 'ts-pattern';

import { ListSearchParams } from '@oyster/core/admin-dashboard/ui';
import { SchoolTag } from '@oyster/core/education/types';
import { db } from '@oyster/db';
import {
  Dashboard,
  Dropdown,
  IconButton,
  Pagination,
  Pill,
  Table,
  type TableColumnProps,
  useSearchParams,
} from '@oyster/ui';

import { Route } from '@/shared/constants';
import { ensureUserAuthenticated } from '@/shared/session.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await ensureUserAuthenticated(request, {
    minimumRole: 'ambassador',
  });

  const url = new URL(request.url);

  const searchParams = ListSearchParams.parse(
    Object.fromEntries(url.searchParams)
  );

  const { schools, totalSchools } = await listSchools(searchParams);

  return json({
    schools,
    totalSchools,
  });
}

async function listSchools({ limit, page, search }: ListSearchParams) {
  const query = db.selectFrom('schools').$if(!!search, (qb) => {
    return qb
      .where(sql<boolean>`similarity(name, ${search}) > 0.15`)
      .where(sql<boolean>`word_similarity(name, ${search}) > 0.15`);
  });

  const [rows, countResult] = await Promise.all([
    query
      .leftJoin('chapters', 'chapters.schoolId', 'schools.id')
      .select([
        'chapters.id as chapterId',
        'schools.addressCity',
        'schools.addressState',
        'schools.id',
        'schools.name',
        'schools.tags',
        (eb) => {
          return eb
            .selectFrom('students')
            .select(eb.fn.countAll<string>().as('count'))
            .whereRef('students.schoolId', '=', 'schools.id')
            .as('students');
        },
      ])
      .$if(!search, (qb) => {
        return qb.orderBy('students', 'desc');
      })
      .$if(!!search, (qb) => {
        return qb.orderBy(sql`similarity(name, ${search})`, 'desc');
      })
      .limit(limit)
      .offset((page - 1) * limit)
      .execute(),

    query
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow(),
  ]);

  return {
    schools: rows,
    totalSchools: parseInt(countResult.count),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  await ensureUserAuthenticated(request);

  return json({});
}

export default function SchoolsPage() {
  return (
    <>
      <Dashboard.Title>Schools</Dashboard.Title>

      <Dashboard.Subheader>
        <Dashboard.SearchForm placeholder="Search..." />
        <SchoolsActionDropdown />
      </Dashboard.Subheader>

      <SchoolsTable />
      <SchoolsPagination />
      <Outlet />
    </>
  );
}

function SchoolsActionDropdown() {
  const [open, setOpen] = useState<boolean>(false);

  function onClose() {
    setOpen(false);
  }

  function onClick() {
    setOpen(true);
  }

  return (
    <Dropdown.Container onClose={onClose}>
      <IconButton
        backgroundColor="gray-100"
        backgroundColorOnHover="gray-200"
        icon={<Menu />}
        onClick={onClick}
        shape="square"
      />

      {open && (
        <Dropdown>
          <Dropdown.List>
            <Dropdown.Item>
              <Link to={Route['/schools/create']}>
                <Plus /> Create School
              </Link>
            </Dropdown.Item>
          </Dropdown.List>
        </Dropdown>
      )}
    </Dropdown.Container>
  );
}

type SchoolInView = SerializeFrom<typeof loader>['schools'][number];

function SchoolsTable() {
  const { schools } = useLoaderData<typeof loader>();

  const columns: TableColumnProps<SchoolInView>[] = [
    {
      displayName: 'Name',
      size: '400',
      render: (school) => school.name,
    },
    {
      displayName: 'Location',
      size: '200',
      render: (school) => `${school.addressCity}, ${school.addressState}`,
    },
    {
      displayName: '# of Students',
      render: (school) => school.students,
      size: '120',
    },
    {
      displayName: 'Tag(s)',
      render: (school) => {
        if (!school.tags?.length) {
          return '';
        }

        return (
          <ul className="flex gap-2">
            {school.tags.map((tag) => {
              return (
                <li key={tag}>
                  {match(tag)
                    .with(SchoolTag.HBCU, () => {
                      return <Pill color="amber-100">HBCU</Pill>;
                    })
                    .with(SchoolTag.HSI, () => {
                      return <Pill color="blue-100">HSI</Pill>;
                    })
                    .otherwise(() => {
                      return <Pill color="gray-100">{tag}</Pill>;
                    })}
                </li>
              );
            })}
          </ul>
        );
      },
      size: '120',
    },
    {
      size: '48',
      sticky: true,
      render: (school) => <SchoolsTableDropdown {...school} />,
    },
  ];

  return (
    <Table columns={columns} data={schools} emptyMessage="No schools found." />
  );
}

function SchoolsPagination() {
  const [searchParams] = useSearchParams(ListSearchParams);

  const { schools, totalSchools } = useLoaderData<typeof loader>();

  return (
    <Pagination
      dataLength={schools.length}
      page={searchParams.page}
      pageSize={searchParams.limit}
      totalCount={totalSchools}
    />
  );
}

function SchoolsTableDropdown({ chapterId, id }: SchoolInView) {
  const [open, setOpen] = useState<boolean>(false);

  function onClose() {
    setOpen(false);
  }

  function onOpen() {
    setOpen(true);
  }

  return (
    <Dropdown.Container onClose={onClose}>
      {open && (
        <Table.Dropdown>
          <Dropdown.List>
            <Dropdown.Item>
              <Link to={generatePath(Route['/schools/:id/edit'], { id })}>
                <Edit /> Edit School
              </Link>
            </Dropdown.Item>

            {!chapterId && (
              <Dropdown.Item>
                <Link
                  to={generatePath(Route['/schools/:id/chapter/create'], {
                    id,
                  })}
                >
                  <BookOpen /> Create Chapter
                </Link>
              </Dropdown.Item>
            )}
          </Dropdown.List>
        </Table.Dropdown>
      )}

      <Table.DropdownOpenButton onClick={onOpen} />
    </Dropdown.Container>
  );
}
