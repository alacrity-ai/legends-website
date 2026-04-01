# Mailgun API Reference

## Foreward
Use this as a reference for building out our booking design, in terms of integration with mailgun.

## Basic snippet (Sending an email)

Basic example:
```
import java.io.File;
import com.mashape.unirest.http.HttpResponse; // unirest v1.4.9
import com.mashape.unirest.http.JsonNode;
import com.mashape.unirest.http.Unirest;
import com.mashape.unirest.http.exceptions.UnirestException;
public class MGSamples {
  public static JsonNode sendSimpleMessage() throws UnirestException {
    String apiKey = System.getenv("API_KEY");
        if (apiKey == null) {
            apiKey = "API_KEY";
        }

    HttpResponse<JsonNode> request = Unirest.post("https://api.mailgun.net/v3/sandbox3dd057c121ad43c2bb2eba1f5d0ac148.mailgun.org/messages")
      .basicAuth("api", apiKey)
      .queryString("from", "Mailgun Sandbox <postmaster@sandbox3dd057c121ad43c2bb2eba1f5d0ac148.mailgun.org>")
```

# Detailed API Docs

I've tried to include the relevent portions of the API docs that will be needed for our mailgun booking implementation

# Send an email

Pass the components of the messages such as To, From, Subject, HTML, text parts, attachments, etc. Mailgun will build a MIME representation of the message and send it. In order to send you must provide one of the following parameters: 'text', 'html', 'amp-html' or 'template'. Important: Send options (parameters starting with o:, h:, v:, or t:) are limited to 16KB total

Endpoint: POST /v3/{domain_name}/messages
Version: 3.0.0
Security: basicAuth

## Path parameters:

  - `domain_name` (string, required)
    Domain name used to send the message

## Request fields (multipart/form-data):

  - `from` (string, required)
    Email address of the  header. Can include a friendly name using the format . Note: not required if sending with a template that has a pre-set From header, but will override the template's From header if provided.

  - `to` (array, required)
    Email address of the recipient(s). Supports friendly name format. Example: . Use commas to separate multiple recipients. Duplicate addresses are automatically ignored.

  - `cc` (array)
    Same as  but for carbon copy recipients. Supports friendly name format.

  - `bcc` (array)
    Same as  but for blind carbon copy recipients. Supports friendly name format.

  - `subject` (string, required)
    Message subject. Note: not required if sending with a template that has a pre-set Subject header, but it will override it if provided.

  - `text` (string)
    Body of the message (text version)

  - `html` (string)
    Body of the message (HTML version)

  - `amp-html` (string)
    AMP part of the message.  Please follow Google guidelines to compose and send AMP emails

  - `attachment` (array)
    File attachment.  You can post multiple  values.   You must use  encoding for sending attachments

  - `inline` (array)
    Attachment with  disposition.  Can be used to send inline images (see example). You can post multiple  values

  - `template` (string)
    Name of a template stored via the Templates API to use to render the email body. See [Templates](https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-templates) for more information

  - `t:version` (string)
    Render a specific version of the given template instead of the latest version.  option must also be provided.

  - `t:text` (string)
    Generates a plain text version of the template alongside the HTML version when sending templated emails. When set to 'yes', instructs Mailgun to create a text/plain MIME part based on the template content, ensuring compatibility with email clients that don't support HTML or have HTML rendering disabled. This improves email deliverability and accessibility by providing a fallback text version in multipart emails.
    Enum: "yes"

  - `t:variables` (string)
    A valid JSON-encoded dictionary used as the input for template variable expansion.  See [Templates](https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-templates) for more information

  - `o:tag` (array)
    Tag string.  See [Tagging](https://documentation.mailgun.com/docs/mailgun/user-manual/tracking-messages/track-tagging) for more information

  - `o:dkim` (string)
    Enables or disables DKIM signatures on a per-message basis. Overrides the domain-level DKIM setting for this specific message.
    Enum: "yes", "no", "true", "false"

  - `o:secondary-dkim` (string)
    Specify a second domain key to sign the email with. The value is formatted as , e.g. . This tells Mailgun to sign the message with the signing domain  using the selector . Note: the domain key specified must have been previously created and activated.

  - `o:secondary-dkim-public` (string)
    Specify an alias of the domain key specified in . Also formatted as .  option must also be provided. Mailgun will sign the message with the provided key of the secondary DKIM, but use the public secondary DKIM name and selector. Note: We will perform a DNS check prior to signing the message to ensure the public keys matches the secondary DKIM.

  - `o:deliverytime` (string)
    Specifies the scheduled delivery time in [RFC-2822 format](https://documentation.mailgun.com/docs/mailgun/api-reference/api-overview#date-format). Depending on your plan, you can schedule messages up to 3 or 7 days in advance. If your domain has a custom message_ttl (time-to-live) setting, this value determines the maximum scheduling duration. Example: 'Fri, 14 Oct 2011 12:00:00 +0000'

  - `o:deliver-within` (string)
    Specifies the maximum time window for delivering the message. Accepts values in format  (e.g., , , ), with a minimum of  and maximum of . For scheduled messages, the delivery window starts from the scheduled time. The standard retry schedule applies within this window, so shorter timeframes may result in fewer delivery attempts.

  - `o:deliverytime-optimize-period` (string)
    Toggles Send Time Optimization (STO) on a per-message basis.  String should be set to the number of hours in  format, with the minimum being  and the maximum being .  This value defines the time window in which Mailgun will run the optimization algorithm based on prior engagement data of a given recipient. See [Sending a Message with STO](https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-sto) for details.

  - `o:time-zone-localize` (string)
    Toggles Timezone Optimization (TZO) on a per message basis. String should be set to preferred delivery time in  or  format, where  is used for 24 hour format without AM/PM and hh:mmaa is used for 12 hour format with AM/PM. See [Sending a Message with TZO](https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-tzo) for details.

  - `o:testmode` (string)
    Enables sending in test mode. Messages are processed normally but not actually delivered to recipients. Useful for testing without sending real emails. See [Sending in Test Mode](https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/test-mode)
    Enum: "yes"

  - `o:tracking` (string)
    Toggles both click and open tracking on a per-message basis
    Enum: "yes", "no", "true", "false", "htmlonly"

  - `o:tracking-clicks` (string)
    Toggles click tracking on a per-message basis, see [Tracking Clicks](https://documentation.mailgun.com/docs/mailgun/user-manual/tracking-messages/tracking-clicks).  This overrides the domain-level click tracking setting.
    Enum: "yes", "no", "true", "false", "htmlonly"

  - `o:tracking-opens` (string)
    Toggles opens tracking on a per-message basis, see [Tracking Opens](https://documentation.mailgun.com/docs/mailgun/user-manual/tracking-messages/tracking-opens).  Has higher priority than domain-level setting.
    Enum: "yes", "no", "true", "false"

  - `o:require-tls` (string)
    When set to 'yes', requires the message to be sent only over a TLS connection to the Email Service Provider. If TLS cannot be established, the message will not be delivered. When set to 'no' (default), Mailgun attempts TLS but falls back to plaintext SMTP if needed.
    Enum: "yes", "no", "true", "false"

  - `o:skip-verification` (string)
    If , the certificate and hostname of the resolved MX Host will not be verified when trying to establish a TLS connection. If , Mailgun will verify the certificate and hostname. If either one can not be verified, a TLS connection will not be established. The default is
    Enum: "yes", "no", "true", "false"

  - `o:sending-ip` (string)
    Used to specify an IP Address to send an email that is owned by your account

  - `o:sending-ip-pool` (string)
    If an IP Pool ID is provided, the email will be delivered with an IP that belongs in that pool

  - `o:tracking-pixel-location-top` (string)
    Places the tracking pixel at the top of emails instead of the bottom. Useful for long emails that may be truncated or have rendering issues, ensuring open tracking works accurately.
    Enum: "yes", "no", "true", "false", "htmlonly"

  - `o:archive-to` (string)
    Sends a copy of successfully delivered messages to the specified URL via HTTP POST. The request uses Content-Type: application/mime and contains the exact message the recipient's SMTP server received. NOTE: These are accounted for and billed as delivered messages

  - `o:suppress-headers` (string)
    Removes specified X-Mailgun headers from the delivered message. Provide header names separated by commas (e.g., 'X-Mailgun-Variables,X-Mailgun-Tag') or use 'all' to remove all X-Mailgun headers.Note: X-Mailgun-Sid header is currently used to process complains received via feedback loops.

  - `h:X-My-Header` (string)
    Adds custom headers to the email. Use 'h:' prefix followed by header name and value. Example: 'h:X-Custom-Header=my-value'

  - `v:my-var` (string)
    Attaches custom data to the message using the 'v:' prefix followed by a variable name. When sending with templates, provides values for template variable substitution (overridden by 't:variables' if both are provided). When not using templates, treated as metadata and included in events/webhooks. Variables are visible in the delivered email's X-Mailgun-Variables header. Example: 'v:user-id=123'. NOTE: Anything over 4KB will be truncated in the event/webhooks.

  - `recipient-variables` (string)
    A JSON-encoded dictionary for batch sending with personalized variables per recipient. Each key is a recipient email address, each value is a dictionary of variables for that recipient. Variables can be referenced in the message using %recipient.variablename%. Example: '{"alice@example.com": {"name":"Alice", "id":1}, "bob@example.com": {"name":"Bob", "id":2}}'. Maximum 1,000 recipients per batch. See [Batch Sending](https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/batch-sending) for more information

## Response 200 fields (application/json):

  - `id` (string, required)
    The unique identifier of the message as defined by [RFC-2392](https://datatracker.ietf.org/doc/html/rfc2392).

  - `message` (string, required)
    A success message

## Response 400 fields (application/json):

  - `message` (string, required)
    A failure message

## Response 429 fields (application/json):

  - `message` (string, required)
    A failure message

## Response 500 fields (application/json):

  - `message` (string, required)
    A failure message

E.g.
```
import FormData from 'form-data';
import fetch from 'node-fetch';

async function run() {
  const form = new FormData();
  form.append('from','string');
  form.append('to','string');
  form.append('cc','string');
  form.append('bcc','string');
  form.append('subject','string');
  form.append('text','string');
  form.append('html','string');
  form.append('amp-html','string');
  form.append('attachment','string');
  form.append('inline','string');
  form.append('template','string');
  form.append('t:version','string');
  form.append('t:text','yes');
  form.append('t:variables','string');
  form.append('o:tag','string');
  form.append('o:dkim','yes');
  form.append('o:secondary-dkim','string');
  form.append('o:secondary-dkim-public','string');
  form.append('o:deliverytime','string');
  form.append('o:deliver-within','string');
  form.append('o:deliverytime-optimize-period','string');
  form.append('o:time-zone-localize','string');
  form.append('o:testmode','yes');
  form.append('o:tracking','yes');
  form.append('o:tracking-clicks','yes');
  form.append('o:tracking-opens','yes');
  form.append('o:require-tls','yes');
  form.append('o:skip-verification','yes');
  form.append('o:sending-ip','string');
  form.append('o:sending-ip-pool','string');
  form.append('o:tracking-pixel-location-top','yes');
  form.append('o:archive-to','string');
  form.append('o:suppress-headers','string');
  form.append('h:X-My-Header','string');
  form.append('v:my-var','string');
  form.append('recipient-variables','string');

  const domainName = 'YOUR_domain_name_PARAMETER';
  const resp = await fetch(
    `https://api.mailgun.net/v3/${domainName}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from('<username>:<password>').toString('base64')
      },
      body: form
    }
  );

  const data = await resp.text();
  console.log(data);
}

run();
```

## Mime format docs (for completeness)
# Send an email in MIME format

Build a MIME string yourself using a MIME library and submit it to Mailgun. Important: Send options (parameters starting with o:, h:, v:, or t:) are limited to 16KB total

Endpoint: POST /v3/{domain_name}/messages.mime
Version: 3.0.0
Security: basicAuth

## Path parameters:

  - `domain_name` (string, required)
    Domain name used to send the message

## Request fields (multipart/form-data):

  - `to` (array, required)
    Email address of the recipient(s). Supports friendly name format. Example: . Use commas to separate multiple recipients. Duplicate addresses are automatically ignored.

  - `message` (string, required)
    MIME string of the message.  Make sure to use  content type to send this as a file upload

  - `template` (string)
    Name of a template stored via template API to use to render the email body. See [Templates](https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-templates) for more information

  - `t:version` (string)
    Render a specific version of the given template instead of the latest version.  option must also be provided.

  - `t:text` (string)
    Generates a plain text version of the template alongside the HTML version when sending templated emails. When set to 'yes', instructs Mailgun to create a text/plain MIME part based on the template content, ensuring compatibility with email clients that don't support HTML or have HTML rendering disabled. This improves email deliverability and accessibility by providing a fallback text version in multipart emails.
    Enum: "yes"

  - `t:variables` (string)
    A valid JSON-encoded dictionary used as the input for template variable expansion. See [Templates](https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-templates) for more information

  - `o:tag` (array)
    Tag string.  See [Tags](https://documentation.mailgun.com/docs/mailgun/user-manual/tracking-messages/track-tagging) for more information

  - `o:dkim` (string)
    Enables or disables DKIM signatures on a per-message basis. Overrides the domain-level DKIM setting for this specific message.
    Enum: "yes", "no", "true", "false"

  - `o:secondary-dkim` (string)
    Specify a second domain key to sign the email with. The value is formatted as , e.g. . This tells Mailgun to sign the message with the signing domain  using the selector . Note: the domain key specified must have been previously created and activated.

  - `o:secondary-dkim-public` (string)
    Specify an alias of the domain key specified in . Also formatted as .  option must also be provided. Mailgun will sign the message with the provided key of the secondary DKIM, but use the public secondary DKIM name and selector. Note: We will perform a DNS check prior to signing the message to ensure the public keys matches the secondary DKIM.

  - `o:deliverytime` (string)
    Specifies the scheduled delivery time in [RFC-2822 format](https://documentation.mailgun.com/docs/mailgun/api-reference/api-overview#date-format). Depending on your plan, you can schedule messages up to 3 or 7 days in advance. If your domain has a custom message_ttl (time-to-live) setting, this value determines the maximum scheduling duration. Example: 'Fri, 14 Oct 2011 12:00:00 +0000'

  - `o:deliver-within` (string)
    Specifies the maximum time window for delivering the message. Accepts values in format  (e.g., , , ), with a minimum of  and maximum of . For scheduled messages, the delivery window starts from the scheduled time. The standard retry schedule applies within this window, so shorter timeframes may result in fewer delivery attempts.

  - `o:deliverytime-optimize-period` (string)
    Toggles Send Time Optimization (STO) on a per-message basis.  String should be set to the number of hours in  format, with the minimum being  and the maximum being .  This value defines the time window in which Mailgun will run the optimization algorithm based on prior engagement data of a given recipient.  See [Sending a Message with STO](https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-sto) for details.

  - `o:time-zone-localize` (string)
    Toggles Timezone Optimization (TZO) on a per message basis. String should be set to preferred delivery time in  or  format, where  is used for 24 hour format without AM/PM and hh:mmaa is used for 12 hour format with AM/PM. See [Sending a Message with TZO](https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-tzo) for details.

  - `o:testmode` (string)
    Enables sending in test mode. Messages are processed normally but not actually delivered to recipients. Useful for testing without sending real emails. See [Sending in Test Mode](https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/test-mode)
    Enum: "yes"

  - `o:tracking` (string)
    Toggles both click and open tracking on a per-message basis, see [Tracking Messages](https://documentation.mailgun.com/docs/mailgun/user-manual/tracking-messages) for details.
    Enum: "yes", "no", "true", "false", "htmlonly"

  - `o:tracking-clicks` (string)
    Toggles click tracking on a per-message basis, see [Tracking Clicks](https://documentation.mailgun.com/docs/mailgun/user-manual/tracking-messages/tracking-clicks).  This overrides the domain-level click tracking setting
    Enum: "yes", "no", "true", "false", "htmlonly"

  - `o:tracking-opens` (string)
    Toggles opens tracking on a per-message basis, see [Tracking Opens](https://documentation.mailgun.com/docs/mailgun/user-manual/tracking-messages/tracking-opens). Has higher priority than domain-level setting.
    Enum: "yes", "no", "true", "false"

  - `o:require-tls` (string)
    When set to 'yes', requires the message to be sent only over a TLS connection. If TLS cannot be established, the message will not be delivered. When set to 'no' (default), Mailgun attempts TLS but falls back to plaintext SMTP if needed.
    Enum: "yes", "no", "true", "false"

  - `o:skip-verification` (string)
    When set to 'true', skips certificate and hostname verification for TLS connections. When 'false' (default), Mailgun verifies certificates and hostnames - if verification fails, TLS connection is not established.
    Enum: "yes", "no", "true", "false"

  - `o:sending-ip` (string)
    Used to specify an IP Address to send an email that is owned by your account

  - `o:sending-ip-pool` (string)
    If an IP Pool ID is provided, the email will be delivered with an IP that belongs in that pool

  - `o:tracking-pixel-location-top` (string)
    Places the tracking pixel at the top of emails instead of the bottom. Useful for long emails that may be truncated or have rendering issues, ensuring open tracking works accurately.
    Enum: "yes", "no", "true", "false", "htmlonly"

  - `o:archive-to` (string)
    Sends a copy of successfully delivered messages to the specified URL via HTTP POST. The request uses Content-Type: application/mime and contains the exact message the recipient's SMTP server received. NOTE: These are accounted for and billed as delivered messages

  - `o:suppress-headers` (string)
    Removes specified X-Mailgun headers from the delivered message. Provide header names separated by commas (e.g., 'X-Mailgun-Variables,X-Mailgun-Tag') or use 'all' to remove all X-Mailgun headers.Note: X-Mailgun-Sid header is currently used to process complains received via feedback loops.

  - `h:X-My-Header` (string)
    Adds custom headers to the email. Use 'h:' prefix followed by header name and value. Example: 'h:X-Custom-Header=my-value'

  - `v:my-var` (string)
    Attaches custom data to the message using the 'v:' prefix followed by a variable name. When sending with templates, provides values for template variable substitution (overridden by 't:variables' if both are provided). When not using templates, treated as metadata and included in events/webhooks. Variables are visible in the delivered email's X-Mailgun-Variables header. Example: 'v:user-id=123'.NOTE: Anything over 4KB will be truncated in the event/webhooks

  - `recipient-variables` (string)
    A JSON-encoded dictionary for batch sending with personalized variables per recipient. Each key is a recipient email address, each value is a dictionary of variables for that recipient. Variables can be referenced in the message using %recipient.variablename%. Example: '{"alice@example.com": {"name":"Alice", "id":1}, "bob@example.com": {"name":"Bob", "id":2}}'. Maximum 1,000 recipients per batch. See [Batch Sending](https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/batch-sending) for more information.

## Response 200 fields (application/json):

  - `id` (string, required)
    The unique identifier of the message as defined by [RFC-2392](https://datatracker.ietf.org/doc/html/rfc2392).

  - `message` (string, required)
    A success message

## Response 400 fields (application/json):

  - `message` (string, required)
    A failure message

## Response 429 fields (application/json):

  - `message` (string, required)
    A failure message

## Response 500 fields (application/json):

  - `message` (string, required)
    A failure message

