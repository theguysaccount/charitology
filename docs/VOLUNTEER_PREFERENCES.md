# Your volunteer preferences

Sign in to [My requests](https://os.charitology.org/participant). Open your linked volunteer interest request and choose **Your volunteer preferences**. Select the kinds of work you are interested in and the times you are usually free. The times use the charity's workspace time zone. A blank time means you have not stated a preference.

Choose **Save preferences** to keep your choices. If the response is interrupted, choose **Retry the same preference change**. The app checks the change you already requested. Choose **Clear saved preferences** to remove all your selections.

Your selections are private to your linked request. Staff cannot see them in the workspace or its exports. You can use the ordinary withdrawal, answer erasure and unlink actions to remove them as well. A saved preference is a personal note: it creates no signup, training record, permission to contact you, or decision about which shifts you can take.

## Running this feature on your own server

Install after the shared OS and sign-in tables exist. Use a separate schema for preferences. The workspace backup does not include this schema and should not be used to recover these selections.

1. Leave `OS_VOLUNTEER_PROFILE_ENABLED=0` while setting up storage. Review the SQL from `volunteerProfileInstallationSql` in [the storage module](../services/charity-os/lib/volunteer-profile-storage.mjs). Pass the exact application schema, separate storage schema, restricted runtime role and dedicated purge role. For a managed PostgreSQL 16 or newer owner with role creation privileges, use `managedDatabaseOwner: true` to create the dedicated role and remove its temporary ownership transfer grant. For a local superuser install, pre-create a separate `NOLOGIN NOINHERIT NOBYPASSRLS` purge role with no memberships and use the default mode.
2. Apply the generated SQL once in an explicit transaction using the database owner. Check the restricted runtime's storage readiness, the two triggers that remove preferences on privacy actions, and the absence of unscoped preference rows. Keep row-level security and the dedicated role restrictions in place.
3. Set `OS_VOLUNTEER_PROFILE_STORAGE_SCHEMA` to the verified private schema and `OS_VOLUNTEER_PROFILE_ENABLED=1`, then deploy. The app only offers the panel after it can confirm the current linked request and storage. To hide the panel, turn off the feature switch and retain the schema and its privacy triggers.

The shipped entry points use `public` as the application schema. There is no staff or public preferences endpoint.
