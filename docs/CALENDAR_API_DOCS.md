# Google Calendar API overview

The Google Calendar API is a RESTful API that can be accessed through explicit HTTP
calls or using the Google Client Libraries. The API exposes most of the features
available in the Google Calendar Web interface.

Following is a list of common terms used in the Google Calendar API:

*[Event](https://developers.google.com/workspace/calendar/v3/reference/events)*
:   An event on a calendar containing information such as the title, start and end
    times, and attendees. Events can be either single events or [recurring
    events](https://developers.google.com/workspace/calendar/concepts/events-calendars#recurring_events). An event is
    represented by an
    [Event resource](https://developers.google.com/workspace/calendar/v3/reference/events#resource-representations).

*[Calendar](https://developers.google.com/workspace/calendar/v3/reference/calendars)*
:   A collection of events. Each calendar has associated metadata, such as
    calendar description or default calendar time zone. The metadata for a single
    calendar is represented by a
    [Calendar resource](https://developers.google.com/workspace/calendar/v3/reference/calendars).

*[Calendar List](https://developers.google.com/workspace/calendar/v3/reference/calendarList)*
:   A list of all calendars on a user's calendar list in the Calendar UI. The
    metadata for a single calendar that appears on the calendar list is represented
    by a
    [CalendarListEntry resource](https://developers.google.com/workspace/calendar/v3/reference/calendarList).
    This metadata includes user-specific properties of the calendar, such
    as its color or notifications for new events.

*[Setting](https://developers.google.com/workspace/calendar/v3/reference/settings)*
:   A user preference from the Calendar UI, such as the user's
    time zone. A single user preference is represented by a
    [Setting Resource](https://developers.google.com/workspace/calendar/v3/reference/settings).

*[ACL](https://developers.google.com/workspace/calendar/v3/reference/acl)*
:   An access control rule granting a user (or a group of users) a specified level
    of access to a calendar. A single access control rule is represented by an [ACL
    resource](https://developers.google.com/workspace/calendar/v3/reference/acl).

## Related topics

- To learn about developing with Google Workspace APIs, including handling
  authentication and authorization, refer
  to
  [Get started as a Google Workspace developer](https://developers.google.com/workspace/guides/getstarted-overview).

- To learn how to configure and run a simple Google Calendar API app, read the
  [Quickstarts overview](https://developers.google.com/workspace/calendar/quickstarts-overview).

|---|---|
| ![](https://fonts.gstatic.com/s/i/productlogos/youtube/v9/192px.svg) | Want to see the Google Calendar API in action? The Google Workspace Developers channel offers videos about tips, tricks, and the latest features. [Subscribe now](https://www.youtube.com/channel/UCUcg6az6etU_gRtZVAhBXaw) |

# Events

The Calendar API provides different flavors of event resources, more information can be found in [About events](https://developers.google.com/workspace/calendar/api/concepts#events_resource).

For a list of [methods](https://developers.google.com/workspace/calendar/api/v3/reference/events#methods) for this resource, see the end of this page.

## Resource representations

<br />

```
{
  "kind": "calendar#event",
  "etag": etag,
  "id": string,
  "status": string,
  "htmlLink": string,
  "created": datetime,
  "updated": datetime,
  "summary": string,
  "description": string,
  "location": string,
  "colorId": string,
  "creator": {
    "id": string,
    "email": string,
    "displayName": string,
    "self": boolean
  },
  "organizer": {
    "id": string,
    "email": string,
    "displayName": string,
    "self": boolean
  },
  "start": {
    "date": date,
    "dateTime": datetime,
    "timeZone": string
  },
  "end": {
    "date": date,
    "dateTime": datetime,
    "timeZone": string
  },
  "endTimeUnspecified": boolean,
  "recurrence": [
    string
  ],
  "recurringEventId": string,
  "originalStartTime": {
    "date": date,
    "dateTime": datetime,
    "timeZone": string
  },
  "transparency": string,
  "visibility": string,
  "iCalUID": string,
  "sequence": integer,
  "attendees": [
    {
      "id": string,
      "email": string,
      "displayName": string,
      "organizer": boolean,
      "self": boolean,
      "resource": boolean,
      "optional": boolean,
      "responseStatus": string,
      "comment": string,
      "additionalGuests": integer
    }
  ],
  "attendeesOmitted": boolean,
  "extendedProperties": {
    "private": {
      (key): string
    },
    "shared": {
      (key): string
    }
  },
  "hangoutLink": string,
  "conferenceData": {
    "createRequest": {
      "requestId": string,
      "conferenceSolutionKey": {
        "type": string
      },
      "status": {
        "statusCode": string
      }
    },
    "entryPoints": [
      {
        "entryPointType": string,
        "uri": string,
        "label": string,
        "pin": string,
        "accessCode": string,
        "meetingCode": string,
        "passcode": string,
        "password": string
      }
    ],
    "conferenceSolution": {
      "key": {
        "type": string
      },
      "name": string,
      "iconUri": string
    },
    "conferenceId": string,
    "signature": string,
    "notes": string,
  },
  "gadget": {
    "type": string,
    "title": string,
    "link": string,
    "iconLink": string,
    "width": integer,
    "height": integer,
    "display": string,
    "preferences": {
      (key): string
    }
  },
  "anyoneCanAddSelf": boolean,
  "guestsCanInviteOthers": boolean,
  "guestsCanModify": boolean,
  "guestsCanSeeOtherGuests": boolean,
  "privateCopy": boolean,
  "locked": boolean,
  "reminders": {
    "useDefault": boolean,
    "overrides": [
      {
        "method": string,
        "minutes": integer
      }
    ]
  },
  "source": {
    "url": string,
    "title": string
  },
  "workingLocationProperties": {
    "type": string,
    "homeOffice": (value),
    "customLocation": {
      "label": string
    },
    "officeLocation": {
      "buildingId": string,
      "floorId": string,
      "floorSectionId": string,
      "deskId": string,
      "label": string
    }
  },
  "outOfOfficeProperties": {
    "autoDeclineMode": string,
    "declineMessage": string
  },
  "focusTimeProperties": {
    "autoDeclineMode": string,
    "declineMessage": string,
    "chatStatus": string
  },
  "attachments": [
    {
      "fileUrl": string,
      "title": string,
      "mimeType": string,
      "iconLink": string,
      "fileId": string
    }
  ],
  "birthdayProperties": {
    "contact": string,
    "type": string,
    "customTypeName": string
  },
  "eventType": string
}
```

| Property name | Value | Description | Notes |
|---|---|---|---|
| `anyoneCanAddSelf` | `boolean` | Whether anyone can invite themselves to the event (deprecated). Optional. The default is False. | writable |
| `attachments[]` | `list` | File attachments for the event. In order to modify attachments the `supportsAttachments` request parameter should be set to `true`. There can be at most 25 attachments per event, <br /> |   |
| `attachments[].fileId` | `string` | ID of the attached file. Read-only. For Google Drive files, this is the ID of the corresponding [`Files`](https://developers.google.com/drive/v3/reference/files) resource entry in the Drive API. |   |
| `attachments[].fileUrl` | `string` | URL link to the attachment. For adding Google Drive file attachments use the same format as in `alternateLink` property of the `Files` resource in the Drive API. Required when adding an attachment. <br /> | writable |
| `attachments[].iconLink` | `string` | URL link to the attachment's icon. This field can only be modified for custom third-party attachments. |   |
| `attachments[].mimeType` | `string` | Internet media type (MIME type) of the attachment. |   |
| `attachments[].title` | `string` | Attachment title. |   |
| `attendeesOmitted` | `boolean` | Whether attendees may have been omitted from the event's representation. When retrieving an event, this may be due to a restriction specified by the `maxAttendee` query parameter. When updating an event, this can be used to only update the participant's response. Optional. The default is False. | writable |
| `attendees[]` | `list` | The attendees of the event. See the [Events with attendees](https://developers.google.com/calendar/concepts/sharing) guide for more information on scheduling events with other calendar users. Service accounts need to use [domain-wide delegation of authority](https://developers.google.com/calendar/auth#perform-g-suite-domain-wide-delegation-of-authority) to populate the attendee list. | writable |
| `attendees[].additionalGuests` | `integer` | Number of additional guests. Optional. The default is 0. | writable |
| `attendees[].comment` | `string` | The attendee's response comment. Optional. | writable |
| `attendees[].displayName` | `string` | The attendee's name, if available. Optional. | writable |
| `attendees[].email` | `string` | The attendee's email address, if available. This field must be present when adding an attendee. It must be a valid email address as per [RFC5322](https://tools.ietf.org/html/rfc5322#section-3.4). Required when adding an attendee. | writable |
| `attendees[].id` | `string` | The attendee's Profile ID, if available. |   |
| `attendees[].optional` | `boolean` | Whether this is an optional attendee. Optional. The default is False. | writable |
| `attendees[].organizer` | `boolean` | Whether the attendee is the organizer of the event. Read-only. The default is False. |   |
| `attendees[].resource` | `boolean` | Whether the attendee is a resource. Can only be set when the attendee is added to the event for the first time. Subsequent modifications are ignored. Optional. The default is False. | writable |
| `attendees[].responseStatus` | `string` | The attendee's response status. Possible values are: - "`needsAction`" - The attendee has not responded to the invitation (recommended for new events). - "`declined`" - The attendee has declined the invitation. - "`tentative`" - The attendee has tentatively accepted the invitation. - "`accepted`" - The attendee has accepted the invitation. **Warning:** If you add an event using the values `declined`, `tentative`, or `accepted`, attendees with the "Add invitations to my calendar" setting set to "When I respond to invitation in email" or "Only if the sender is known" might have their response reset to `needsAction` and won't see an event in their calendar unless they change their response in the event invitation email. Furthermore, if more than 200 guests are invited to the event, response status is not propagated to the guests. | writable |
| `attendees[].self` | `boolean` | Whether this entry represents the calendar on which this copy of the event appears. Read-only. The default is False. |   |
| `birthdayProperties` | `nested object` | Birthday or special event data. Used if `eventType` is `"birthday"`. Immutable. | writable |
| `birthdayProperties.contact` | `string` | Resource name of the contact this birthday event is linked to. This can be used to fetch contact details from [People API](https://developers.google.com/people). Format: `"people/c12345"`. Read-only. |   |
| `birthdayProperties.customTypeName` | `string` | Custom type label specified for this event. This is populated if `birthdayProperties.type` is set to `"custom"`. Read-only. |   |
| `birthdayProperties.type` | `string` | Type of birthday or special event. Possible values are: - `"anniversary"` - An anniversary other than birthday. Always has a `contact`. - `"birthday"` - A birthday event. This is the default value. - `"custom"` - A special date whose label is further specified in the `customTypeName` field. Always has a `contact`. - `"other"` - A special date which does not fall into the other categories, and does not have a custom label. Always has a `contact`. - `"self"` - Calendar owner's own birthday. Cannot have a `contact`. The Calendar API only supports creating events with the type `"birthday"`. The type cannot be changed after the event is created. | writable |
| `colorId` | `string` | The color of the event. This is an ID referring to an entry in the `event` section of the colors definition (see the [colors endpoint](https://developers.google.com/calendar/v3/reference/colors)). Optional. | writable |
| `conferenceData` | `nested object` | The conference-related information, such as details of a Google Meet conference. To create new conference details use the `createRequest` field. To persist your changes, remember to set the `conferenceDataVersion` request parameter to `1` for all event modification requests. **Warning:** Reusing Google Meet conference data across different events can cause access issues and expose meeting details to unintended users. To help ensure meeting privacy, always generate a unique conference for each event by using the `createRequest` field. | writable |
| `conferenceData.conferenceId` | `string` | The ID of the conference. Can be used by developers to keep track of conferences, should not be displayed to users. The ID value is formed differently for each conference solution type: - `eventHangout`: ID is not set. (This conference type is deprecated.) - `eventNamedHangout`: ID is the name of the Hangout. (This conference type is deprecated.) - `hangoutsMeet`: ID is the 10-letter meeting code, for example `aaa-bbbb-ccc`. - `addOn`: ID is defined by the third-party provider. Optional. <br /> <br /> |   |
| `conferenceData.conferenceSolution` | `nested object` | The conference solution, such as Google Meet. Unset for a conference with a failed create request. Either `conferenceSolution` and at least one `entryPoint`, or `createRequest` is required. <br /> |   |
| `conferenceData.conferenceSolution.iconUri` | `string` | The user-visible icon for this solution. |   |
| `conferenceData.conferenceSolution.key` | `nested object` | The key which can uniquely identify the conference solution for this event. |   |
| `conferenceData.conferenceSolution.key.type` | `string` | The conference solution type. If a client encounters an unfamiliar or empty type, it should still be able to display the entry points. However, it should disallow modifications. The possible values are: - `"eventHangout"` for Hangouts for consumers (deprecated; existing events may show this conference solution type but new conferences cannot be created) - `"eventNamedHangout"` for classic Hangouts for Google Workspace users (deprecated; existing events may show this conference solution type but new conferences cannot be created) - `"hangoutsMeet"` for Google Meet (http://meet.google.com) - `"addOn"` for 3P conference providers <br /> <br /> |   |
| `conferenceData.conferenceSolution.name` | `string` | The user-visible name of this solution. Not localized. |   |
| `conferenceData.createRequest` | `nested object` | A request to generate a new conference and attach it to the event. The data is generated asynchronously. To see whether the data is present check the `status` field. Either `conferenceSolution` and at least one `entryPoint`, or `createRequest` is required. |   |
| `conferenceData.createRequest.conferenceSolutionKey` | `nested object` | The conference solution, such as Hangouts or Google Meet. |   |
| `conferenceData.createRequest.conferenceSolutionKey.type` | `string` | The conference solution type. If a client encounters an unfamiliar or empty type, it should still be able to display the entry points. However, it should disallow modifications. The possible values are: - `"eventHangout"` for Hangouts for consumers (deprecated; existing events may show this conference solution type but new conferences cannot be created) - `"eventNamedHangout"` for classic Hangouts for Google Workspace users (deprecated; existing events may show this conference solution type but new conferences cannot be created) - `"hangoutsMeet"` for Google Meet (http://meet.google.com) - `"addOn"` for 3P conference providers <br /> <br /> |   |
| `conferenceData.createRequest.requestId` | `string` | The client-generated unique ID for this request. Clients should regenerate this ID for every new request. If an ID provided is the same as for the previous request, the request is ignored. |   |
| `conferenceData.createRequest.status` | `nested object` | The status of the conference create request. |   |
| `conferenceData.createRequest.status.statusCode` | `string` | The current status of the conference create request. Read-only. The possible values are: - `"pending"`: the conference create request is still being processed. - `"success"`: the conference create request succeeded, the entry points are populated. - `"failure"`: the conference create request failed, there are no entry points. <br /> |   |
| `conferenceData.entryPoints[]` | `list` | Information about individual conference entry points, such as URLs or phone numbers. All of them must belong to the same conference. Either `conferenceSolution` and at least one `entryPoint`, or `createRequest` is required. <br /> |   |
| `conferenceData.entryPoints[].accessCode` | `string` | The access code to access the conference. The maximum length is 128 characters. When creating new conference data, populate only the subset of {`meetingCode`, `accessCode`, `passcode`, `password`, `pin`} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed. Optional. <br /> |   |
| `conferenceData.entryPoints[].entryPointType` | `string` | The type of the conference entry point. Possible values are: - `"video"` - joining a conference over HTTP. A conference can have zero or one `video` entry point. - `"phone"` - joining a conference by dialing a phone number. A conference can have zero or more `phone` entry points. - `"sip"` - joining a conference over SIP. A conference can have zero or one `sip` entry point. - `"more"` - further conference joining instructions, for example additional phone numbers. A conference can have zero or one `more` entry point. A conference with only a `more` entry point is not a valid conference. <br /> |   |
| `conferenceData.entryPoints[].label` | `string` | The label for the URI. Visible to end users. Not localized. The maximum length is 512 characters. Examples: - for `video`: meet.google.com/aaa-bbbb-ccc - for `phone`: +1 123 268 2601 - for `sip`: 12345678@altostrat.com - for `more`: should not be filled Optional. <br /> |   |
| `conferenceData.entryPoints[].meetingCode` | `string` | The meeting code to access the conference. The maximum length is 128 characters. When creating new conference data, populate only the subset of {`meetingCode`, `accessCode`, `passcode`, `password`, `pin`} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed. Optional. <br /> |   |
| `conferenceData.entryPoints[].passcode` | `string` | The passcode to access the conference. The maximum length is 128 characters. When creating new conference data, populate only the subset of {`meetingCode`, `accessCode`, `passcode`, `password`, `pin`} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed. |   |
| `conferenceData.entryPoints[].password` | `string` | The password to access the conference. The maximum length is 128 characters. When creating new conference data, populate only the subset of {`meetingCode`, `accessCode`, `passcode`, `password`, `pin`} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed. Optional. <br /> |   |
| `conferenceData.entryPoints[].pin` | `string` | The PIN to access the conference. The maximum length is 128 characters. When creating new conference data, populate only the subset of {`meetingCode`, `accessCode`, `passcode`, `password`, `pin`} fields that match the terminology that the conference provider uses. Only the populated fields should be displayed. Optional. <br /> |   |
| `conferenceData.entryPoints[].uri` | `string` | The URI of the entry point. The maximum length is 1300 characters. Format: - for `video`, `http:` or `https:` schema is required. - for `phone`, `tel:` schema is required. The URI should include the entire dial sequence (e.g., tel:+12345678900,,,123456789;1234). - for `sip`, `sip:` schema is required, e.g., sip:12345678@myprovider.com. - for `more`, `http:` or `https:` schema is required. <br /> |   |
| `conferenceData.notes` | `string` | Additional notes (such as instructions from the domain administrator, legal notices) to display to the user. Can contain HTML. The maximum length is 2048 characters. Optional. |   |
| `conferenceData.signature` | `string` | The signature of the conference data. Generated on server side. Unset for a conference with a failed create request. Optional for a conference with a pending create request. <br /> <br /> |   |
| `created` | `datetime` | Creation time of the event (as a [RFC3339](https://tools.ietf.org/html/rfc3339) timestamp). Read-only. |   |
| `creator` | `object` | The creator of the event. Read-only. |   |
| `creator.displayName` | `string` | The creator's name, if available. |   |
| `creator.email` | `string` | The creator's email address, if available. |   |
| `creator.id` | `string` | The creator's Profile ID, if available. |   |
| `creator.self` | `boolean` | Whether the creator corresponds to the calendar on which this copy of the event appears. Read-only. The default is False. |   |
| `description` | `string` | Description of the event. Can contain HTML. Optional. | writable |
| `end` | `nested object` | The (exclusive) end time of the event. For a recurring event, this is the end time of the first instance. |   |
| `end.date` | `date` | The date, in the format "yyyy-mm-dd", if this is an all-day event. | writable |
| `end.dateTime` | `datetime` | The time, as a combined date-time value (formatted according to [RFC3339](https://tools.ietf.org/html/rfc3339)). A time zone offset is required unless a time zone is explicitly specified in `timeZone`. | writable |
| `end.timeZone` | `string` | The time zone in which the time is specified. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end. | writable |
| `endTimeUnspecified` | `boolean` | Whether the end time is actually unspecified. An end time is still provided for compatibility reasons, even if this attribute is set to True. The default is False. |   |
| `etag` | `etag` | ETag of the resource. |   |
| `eventType` | `string` | Specific type of the event. This cannot be modified after the event is created. Possible values are: - "`birthday`" - A special all-day event with an annual recurrence. - "`default`" - A regular event or not further specified. - "`focusTime`" - A focus-time event. - "`fromGmail`" - An event from Gmail. This type of event cannot be created. - "`outOfOffice`" - An out-of-office event. - "`workingLocation`" - A working location event. | writable |
| `extendedProperties` | `object` | Extended properties of the event. |   |
| `extendedProperties.private` | `object` | Properties that are private to the copy of the event that appears on this calendar. | writable |
| `extendedProperties.private.(key)` | `string` | The name of the private property and the corresponding value. |   |
| `extendedProperties.shared` | `object` | Properties that are shared between copies of the event on other attendees' calendars. | writable |
| `extendedProperties.shared.(key)` | `string` | The name of the shared property and the corresponding value. |   |
| `focusTimeProperties` | `nested object` | Focus Time event data. Used if `eventType` is `focusTime`. | writable |
| `focusTimeProperties.autoDeclineMode` | `string` | Whether to decline meeting invitations which overlap Focus Time events. Valid values are `declineNone`, meaning that no meeting invitations are declined; `declineAllConflictingInvitations`, meaning that all conflicting meeting invitations that conflict with the event are declined; and `declineOnlyNewConflictingInvitations`, meaning that only new conflicting meeting invitations which arrive while the Focus Time event is present are to be declined. |   |
| `focusTimeProperties.chatStatus` | `string` | The status to mark the user in Chat and related products. This can be `available` or `doNotDisturb`. |   |
| `focusTimeProperties.declineMessage` | `string` | Response message to set if an existing event or new invitation is automatically declined by Calendar. |   |
| `gadget` | `object` | A gadget that extends this event. Gadgets are deprecated; this structure is instead only used for returning birthday calendar metadata. |   |
| `gadget.display` | `string` | The gadget's display mode. Deprecated. Possible values are: - "`icon`" - The gadget displays next to the event's title in the calendar view. - "`chip`" - The gadget displays when the event is clicked. | writable |
| `gadget.height` | `integer` | The gadget's height in pixels. The height must be an integer greater than 0. Optional. Deprecated. | writable |
| `gadget.iconLink` | `string` | The gadget's icon URL. The URL scheme must be HTTPS. Deprecated. | writable |
| `gadget.link` | `string` | The gadget's URL. The URL scheme must be HTTPS. Deprecated. | writable |
| `gadget.preferences` | `object` | Preferences. | writable |
| `gadget.preferences.(key)` | `string` | The preference name and corresponding value. |   |
| `gadget.title` | `string` | The gadget's title. Deprecated. | writable |
| `gadget.type` | `string` | The gadget's type. Deprecated. | writable |
| `gadget.width` | `integer` | The gadget's width in pixels. The width must be an integer greater than 0. Optional. Deprecated. | writable |
| `guestsCanInviteOthers` | `boolean` | Whether attendees other than the organizer can invite others to the event. Optional. The default is True. | writable |
| `guestsCanModify` | `boolean` | Whether attendees other than the organizer can modify the event. Optional. The default is False. | writable |
| `guestsCanSeeOtherGuests` | `boolean` | Whether attendees other than the organizer can see who the event's attendees are. Optional. The default is True. | writable |
| `hangoutLink` | `string` | An absolute link to the Google Hangout associated with this event. Read-only. |   |
| `htmlLink` | `string` | An absolute link to this event in the Google Calendar Web UI. Read-only. |   |
| `iCalUID` | `string` | Event unique identifier as defined in [RFC5545](https://tools.ietf.org/html/rfc5545#section-3.8.4.7). It is used to uniquely identify events accross calendaring systems and must be supplied when importing events via the [import](https://developers.google.com/calendar/v3/reference/events/import) method. Note that the `iCalUID` and the `id` are not identical and only one of them should be supplied at event creation time. One difference in their semantics is that in recurring events, all occurrences of one event have different `id`s while they all share the same `iCalUID`s. To retrieve an event using its `iCalUID`, call the [events.list method using the `iCalUID` parameter](https://developers.google.com/calendar/v3/reference/events/list#iCalUID). To retrieve an event using its `id`, call the [events.get](https://developers.google.com/calendar/v3/reference/events/get) method. |   |
| `id` | `string` | Opaque identifier of the event. When creating new single or recurring events, you can specify their IDs. Provided IDs must follow these rules: - characters allowed in the ID are those used in base32hex encoding, i.e. lowercase letters a-v and digits 0-9, see section 3.1.2 in [RFC2938](http://tools.ietf.org/html/rfc2938#section-3.1.2) - the length of the ID must be between 5 and 1024 characters - the ID must be unique per calendar Due to the globally distributed nature of the system, we cannot guarantee that ID collisions will be detected at event creation time. To minimize the risk of collisions we recommend using an established UUID algorithm such as one described in [RFC4122](https://tools.ietf.org/html/rfc4122). If you do not specify an ID, it will be automatically generated by the server. Note that the `icalUID` and the `id` are not identical and only one of them should be supplied at event creation time. One difference in their semantics is that in recurring events, all occurrences of one event have different `id`s while they all share the same `icalUID`s. <br /> | writable |
| `kind` | `string` | Type of the resource ("`calendar#event`"). |   |
| `location` | `string` | Geographic location of the event as free-form text. Optional. | writable |
| `locked` | `boolean` | Whether this is a locked event copy where no changes can be made to the main event fields "summary", "description", "location", "start", "end" or "recurrence". The default is False. Read-Only. |   |
| `organizer` | `object` | The organizer of the event. If the organizer is also an attendee, this is indicated with a separate entry in `attendees` with the `organizer` field set to True. To change the organizer, use the [move](https://developers.google.com/calendar/v3/reference/events/move) operation. Read-only, except when importing an event. | writable |
| `organizer.displayName` | `string` | The organizer's name, if available. | writable |
| `organizer.email` | `string` | The organizer's email address, if available. It must be a valid email address as per [RFC5322](https://tools.ietf.org/html/rfc5322#section-3.4). | writable |
| `organizer.id` | `string` | The organizer's Profile ID, if available. |   |
| `organizer.self` | `boolean` | Whether the organizer corresponds to the calendar on which this copy of the event appears. Read-only. The default is False. |   |
| `originalStartTime` | `nested object` | For an instance of a recurring event, this is the time at which this event would start according to the recurrence data in the recurring event identified by recurringEventId. It uniquely identifies the instance within the recurring event series even if the instance was moved to a different time. Immutable. |   |
| `originalStartTime.date` | `date` | The date, in the format "yyyy-mm-dd", if this is an all-day event. | writable |
| `originalStartTime.dateTime` | `datetime` | The time, as a combined date-time value (formatted according to [RFC3339](https://tools.ietf.org/html/rfc3339)). A time zone offset is required unless a time zone is explicitly specified in `timeZone`. | writable |
| `originalStartTime.timeZone` | `string` | The time zone in which the time is specified. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end. | writable |
| `outOfOfficeProperties` | `nested object` | Out of office event data. Used if `eventType` is `outOfOffice`. | writable |
| `outOfOfficeProperties.autoDeclineMode` | `string` | Whether to decline meeting invitations which overlap Out of office events. Valid values are `declineNone`, meaning that no meeting invitations are declined; `declineAllConflictingInvitations`, meaning that all conflicting meeting invitations that conflict with the event are declined; and `declineOnlyNewConflictingInvitations`, meaning that only new conflicting meeting invitations which arrive while the Out of office event is present are to be declined. |   |
| `outOfOfficeProperties.declineMessage` | `string` | Response message to set if an existing event or new invitation is automatically declined by Calendar. |   |
| `privateCopy` | `boolean` | If set to True, [Event propagation](https://developers.google.com/calendar/concepts/sharing#event_propagation) is disabled. Note that it is not the same thing as [Private event properties](https://developers.google.com/calendar/concepts/sharing#private_event_properties). Optional. Immutable. The default is False. |   |
| `recurrence[]` | `list` | List of RRULE, EXRULE, RDATE and EXDATE lines for a recurring event, as specified in [RFC5545](http://tools.ietf.org/html/rfc5545#section-3.8.5). Note that DTSTART and DTEND lines are not allowed in this field; event start and end times are specified in the `start` and `end` fields. This field is omitted for single events or instances of recurring events. | writable |
| `recurringEventId` | `string` | For an instance of a recurring event, this is the `id` of the recurring event to which this instance belongs. Immutable. |   |
| `reminders` | `object` | Information about the event's reminders for the authenticated user. Note that changing reminders does not also change the `updated` property of the enclosing event. |   |
| `reminders.overrides[]` | `list` | If the event doesn't use the default reminders, this lists the reminders specific to the event, or, if not set, indicates that no reminders are set for this event. The maximum number of override reminders is 5. | writable |
| `reminders.overrides[].method` | `string` | The method used by this reminder. Possible values are: - "`email`" - Reminders are sent via email. - "`popup`" - Reminders are sent via a UI popup. Required when adding a reminder. | writable |
| `reminders.overrides[].minutes` | `integer` | Number of minutes before the start of the event when the reminder should trigger. Valid values are between 0 and 40320 (4 weeks in minutes). Required when adding a reminder. | writable |
| `reminders.useDefault` | `boolean` | Whether the default reminders of the calendar apply to the event. | writable |
| `sequence` | `integer` | Sequence number as per iCalendar. | writable |
| `source` | `object` | Source from which the event was created. For example, a web page, an email message or any document identifiable by an URL with HTTP or HTTPS scheme. Can only be seen or modified by the creator of the event. |   |
| `source.title` | `string` | Title of the source; for example a title of a web page or an email subject. | writable |
| `source.url` | `string` | URL of the source pointing to a resource. The URL scheme must be HTTP or HTTPS. | writable |
| `start` | `nested object` | The (inclusive) start time of the event. For a recurring event, this is the start time of the first instance. |   |
| `start.date` | `date` | The date, in the format "yyyy-mm-dd", if this is an all-day event. | writable |
| `start.dateTime` | `datetime` | The time, as a combined date-time value (formatted according to [RFC3339](https://tools.ietf.org/html/rfc3339)). A time zone offset is required unless a time zone is explicitly specified in `timeZone`. | writable |
| `start.timeZone` | `string` | The time zone in which the time is specified. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) For recurring events this field is required and specifies the time zone in which the recurrence is expanded. For single events this field is optional and indicates a custom time zone for the event start/end. | writable |
| `status` | `string` | Status of the event. Optional. Possible values are: - "`confirmed`" - The event is confirmed. This is the default status. - "`tentative`" - The event is tentatively confirmed. - "`cancelled`" - The event is cancelled (deleted). The [list](https://developers.google.com/calendar/v3/reference/events/list) method returns cancelled events only on incremental sync (when `syncToken` or `updatedMin` are specified) or if the `showDeleted` flag is set to `true`. The [get](https://developers.google.com/calendar/v3/reference/events/get) method always returns them. A cancelled status represents two different states depending on the event type: 1. Cancelled exceptions of an uncancelled recurring event indicate that this instance should no longer be presented to the user. Clients should store these events for the lifetime of the parent recurring event. Cancelled exceptions are only guaranteed to have values for the `id`, `recurringEventId` and `originalStartTime` fields populated. The other fields might be empty. 2. All other cancelled events represent deleted events. Clients should remove their locally synced copies. Such cancelled events will eventually disappear, so do not rely on them being available indefinitely. Deleted events are only guaranteed to have the `id` field populated. On the organizer's calendar, cancelled events continue to expose event details (summary, location, etc.) so that they can be restored (undeleted). Similarly, the events to which the user was invited and that they manually removed continue to provide details. However, incremental sync requests with `showDeleted` set to false will not return these details. If an event changes its organizer (for example via the [move](https://developers.google.com/calendar/v3/reference/events/move) operation) and the original organizer is not on the attendee list, it will leave behind a cancelled event where only the `id` field is guaranteed to be populated. <br /> | writable |
| `summary` | `string` | Title of the event. | writable |
| `transparency` | `string` | Whether the event blocks time on the calendar. Optional. Possible values are: - "`opaque`" - Default value. The event does block time on the calendar. This is equivalent to setting **Show me as** to **Busy** in the Calendar UI. - "`transparent`" - The event does not block time on the calendar. This is equivalent to setting **Show me as** to **Available** in the Calendar UI. | writable |
| `updated` | `datetime` | Last modification time of the main event data (as a [RFC3339](https://tools.ietf.org/html/rfc3339) timestamp). Updating event reminders will not cause this to change. Read-only. |   |
| `visibility` | `string` | Visibility of the event. Optional. Possible values are: - "`default`" - Uses the default visibility for events on the calendar. This is the default value. - "`public`" - The event is public and event details are visible to all readers of the calendar. - "`private`" - The event is private and only event attendees may view event details. - "`confidential`" - The event is private. This value is provided for compatibility reasons. | writable |
| `workingLocationProperties` | `nested object` | Working location event data. | writable |
| `workingLocationProperties.customLocation` | `object` | If present, specifies that the user is working from a custom location. | writable |
| `workingLocationProperties.customLocation.label` | `string` | An optional extra label for additional information. | writable |
| `workingLocationProperties.homeOffice` | `any value` | If present, specifies that the user is working at home. | writable |
| `workingLocationProperties.officeLocation` | `object` | If present, specifies that the user is working from an office. | writable |
| `workingLocationProperties.officeLocation.buildingId` | `string` | An optional building identifier. This should reference a building ID in the organization's Resources database. | writable |
| `workingLocationProperties.officeLocation.deskId` | `string` | An optional desk identifier. | writable |
| `workingLocationProperties.officeLocation.floorId` | `string` | An optional floor identifier. | writable |
| `workingLocationProperties.officeLocation.floorSectionId` | `string` | An optional floor section identifier. | writable |
| `workingLocationProperties.officeLocation.label` | `string` | The office name that's displayed in Calendar Web and Mobile clients. We recommend you reference a building name in the organization's Resources database. | writable |
| `workingLocationProperties.type` | `string` | Type of the working location. Possible values are: - "`homeOffice`" - The user is working at home. - "`officeLocation`" - The user is working from an office. - "`customLocation`" - The user is working from a custom location. Any details are specified in a sub-field of the specified name, but this field may be missing if empty. Any other fields are ignored. Required when adding working location properties. | writable |

## Methods

[delete](https://developers.google.com/workspace/calendar/api/v3/reference/events/delete)
:   Deletes an event.

[get](https://developers.google.com/workspace/calendar/api/v3/reference/events/get)
:   Returns an event based on its Google Calendar ID. To retrieve an event using its iCalendar ID, call the [events.list method using the `iCalUID` parameter](https://developers.google.com/workspace/calendar/api/v3/reference/events/list#iCalUID).

[import](https://developers.google.com/workspace/calendar/api/v3/reference/events/import)
:   Imports an event. This operation is used to add a private copy of an existing event to a calendar. Only events with an `eventType` of `default` may be imported.

    **Deprecated behavior:** If a non-`default` event is imported, its type will be changed to `default` and any event-type-specific properties it may have will be dropped.

[insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)
:   Creates an event.

[instances](https://developers.google.com/workspace/calendar/api/v3/reference/events/instances)
:   Returns instances of the specified recurring event.

[list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list)
:   Returns events on the specified calendar.

[move](https://developers.google.com/workspace/calendar/api/v3/reference/events/move)
:   Moves an event to another calendar, i.e. changes an event's organizer. Note that only `default` events can be moved; `birthday`, `focusTime`, `fromGmail`, `outOfOffice` and `workingLocation` events cannot be moved.

[patch](https://developers.google.com/workspace/calendar/api/v3/reference/events/patch)
:   Updates an event. This method supports patch semantics. Note that each patch request consumes three quota units; prefer using a `get` followed by an `update`. The field values you specify replace the existing values. Fields that you don't specify in the request remain unchanged. Array fields, if specified, overwrite the existing arrays; this discards any previous array elements.

[quickAdd](https://developers.google.com/workspace/calendar/api/v3/reference/events/quickAdd)
:   Creates an event based on a simple text string.

[update](https://developers.google.com/workspace/calendar/api/v3/reference/events/update)
:   Updates an event. This method does not support patch semantics and always updates the entire event resource. To do a partial update, perform a `get` followed by an `update` using etags to ensure atomicity.

[watch](https://developers.google.com/workspace/calendar/api/v3/reference/events/watch)
:   Watch for changes to Events resources.

# Calendars

A collection of all existing calendars. See also [Calendars vs CalendarList](https://developers.google.com/workspace/calendar/api/concepts/events-calendars#calendar_and_calendar_list).

For a list of [methods](https://developers.google.com/workspace/calendar/api/v3/reference/calendars#methods) for this resource, see the end of this page.

## Resource representations

<br />

```
{
  "kind": "calendar#calendar",
  "etag": etag,
  "id": string,
  "summary": string,
  "description": string,
  "location": string,
  "timeZone": string,
  "dataOwner": string,
  "conferenceProperties": {
    "allowedConferenceSolutionTypes": [
      string
    ]
  },
  "autoAcceptInvitations": boolean
}
```

| Property name | Value | Description | Notes |
|---|---|---|---|
| `autoAcceptInvitations` | `boolean` | Whether this calendar automatically accepts invitations. Only valid for resource calendars. |   |
| `conferenceProperties` | `nested object` | Conferencing properties for this calendar, for example what types of conferences are allowed. |   |
| `conferenceProperties.allowedConferenceSolutionTypes[]` | `list` | The types of conference solutions that are supported for this calendar. The possible values are: - `"eventHangout"` - `"eventNamedHangout"` - `"hangoutsMeet"` Optional. <br /> |   |
| `dataOwner` | `string` | The email of the owner of the calendar. Set only for secondary calendars. Read-only. |   |
| `description` | `string` | Description of the calendar. Optional. | writable |
| `etag` | `etag` | ETag of the resource. |   |
| `id` | `string` | Identifier of the calendar. To retrieve IDs call the [calendarList.list()](https://developers.google.com/calendar/v3/reference/calendarList/list) method. |   |
| `kind` | `string` | Type of the resource ("`calendar#calendar`"). |   |
| `location` | `string` | Geographic location of the calendar as free-form text. Optional. | writable |
| `summary` | `string` | Title of the calendar. | writable |
| `timeZone` | `string` | The time zone of the calendar. (Formatted as an IANA Time Zone Database name, e.g. "Europe/Zurich".) Optional. | writable |

## Methods

[clear](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/clear)
:   Clears a primary calendar. This operation deletes all events associated with the primary calendar of an account.

[delete](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/delete)
:   Deletes a secondary calendar. Use calendars.clear for clearing all events on primary calendars.

[get](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/get)
:   Returns metadata for a calendar.

[insert](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert)

:   Creates a secondary calendar. The authenticated user for the request is made the data owner of the new calendar.

    <br />

    **Note:** We recommend to authenticate as the intended data owner of the calendar. You can use [domain-wide delegation of authority](https://developers.google.com/workspace/cloud-search/docs/guides/delegation) to allow applications to act on behalf of a specific user. Don't use a service account for authentication. If you use a service account for authentication, the service account is the data owner, which can lead to unexpected behavior. For example, if a service account is the data owner, data ownership cannot be transferred.

    <br />

[patch](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/patch)
:   Updates metadata for a calendar. This method supports patch semantics. Note that each patch request consumes three quota units; prefer using a `get` followed by an `update`. The field values you specify replace the existing values. Fields that you don't specify in the request remain unchanged. Array fields, if specified, overwrite the existing arrays; this discards any previous array elements.

[update](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/update)
:   Updates metadata for a calendar.