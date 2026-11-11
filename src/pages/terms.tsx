import { Helmet } from '@dr.pogodin/react-helmet';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

const markdown = `# <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> Terms of Use

<span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> ("**we**," "**us**," or "**our**") owns and operates <span data-field="domainName" data-type="url" data-editable="true">soccercenter.org</span> and other sites linking to these Terms of Use (individually, the "Site", and collectively, the "Sites"). Through the Sites, <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> provides various offerings, information, and resources related to the products and services available on our Sites (each a "Service" and collectively, the "Services"). References to the Sites include the Services.

<span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> may change, suspend, modify, or discontinue all or any part of the Sites in its sole discretion with or without notice. <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> is not liable if all or any part of a Site is, for any reason, unavailable at any time or for any period. <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> reserves the right to block or deny access to any of the Sites to anyone at any time for any reason. <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> is not obligated to correct or update any information or content on the Sites.

## General Terms

These terms of use (together with any additional terms, as described below) ("Terms of Use") are an agreement between <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> and the individuals that use the Sites <span data-section="children" data-section-when="true" data-hidden="true" style="display:none">(or the parent/legal guardian of any such individuals under the age of 18) </span>("**users**," "**you**," or "**your**"). The Terms of Use govern your access to and use of the Sites. Subject to your full and ongoing compliance with these Terms of Use, <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> hereby grants you a limited and revocable right to access and use the Sites, solely for their intended purposes. If you use or access the Sites on behalf of a business or other entity, you must have authority to bind that business/entity. In such case, the term "you" includes the business/entity and any of its agents that use or access the Sites. By using or accessing the Sites, you represent and warrant that you are of legal age to accept these Terms of Use and form a binding contract with <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span>.

IF YOU ARE UNDER THE AGE OF 18 (A MINOR), YOUR PARENT OR LEGAL GUARDIAN MUST READ AND CONSENT TO THE TERMS OF USE BEFORE YOU USE THE SITES. BY PERMITTING A MINOR TO USE THE SITES, THE MINOR'S PARENT OR GUARDIAN BECOMES SUBJECT TO THE TERMS OF USE AND AGREES TO BE RESPONSIBLE FOR THE MINOR'S ACTIVITIES ON THE SITES.

We may now or in the future offer multiple platforms (the "<span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> Platforms") through our Sites for use in accessing our Services. To use the Platforms, you must adhere to any additional terms and conditions specific to each Platform, as identified below and/or presented to you at the time you use the Platforms. Certain offerings on the Sites may be free of charge or offered for a fee, and we reserve the right to change what Services are offered free of charge or for a fee, and the fees charged for any given Service.

PLEASE READ THE TERMS OF USE CAREFULLY. BY ACCESSING ANY PAGES ON THE SITES; CREATING AN ACCOUNT; USING ANY SERVICES MADE AVAILABLE THROUGH THE SITES; POSTING, SUBMITTING, TRANSMITTING, OR UPLOADING ANY INFORMATION OR CONTENT THROUGH THE SITES; OR USING ANY PLATFORM, YOU EXPRESSLY AGREE THAT YOU<span data-section="children" data-section-when="true" data-hidden="true" style="display:none">, OR YOUR PARENT OR LEGAL GUARDIAN FOR USERS UNDER THE AGE OF 18,</span> HAVE READ, UNDERSTAND, AND AGREE TO THE TERMS OF USE AND ANY APPLICABLE POLICIES AND DISCLAIMERS REFERENCED HEREIN OR ON THE SITES. DO NOT USE THE SITES IF YOU DO NOT AGREE TO THE TERMS OF USE AND ALL APPLICABLE POLICIES AND DISCLAIMERS.

## Changes to the Terms of Use

As stated above, <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> reserves the right to update or modify the Terms of Use at any time, with or without prior notice. Any such changes will become effective upon the earlier of (i) the first time you use the Sites or Services with actual notice of the change(s), or (ii) 30 days after the change(s) are publicly posted on the Sites. Disputes arising under these Terms will be resolved in accordance with the version of the Terms of Use in place at the time the dispute arose. We use reasonable efforts to ensure that the Terms of Use identify the last date of update.

In the case of material changes to the Terms, <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> will make reasonable efforts to notify you of the change, such as by sending an email to any address we have on file, displaying a pop-up window on the Sites, or other similar mechanism. We encourage you to review the Terms of Use frequently to stay informed of any changes.

## Account Access and Security

You may be required to register and create an account to access some content and functionality on the Sites and/or Platforms. You may be required to provide personal information, such as an email and password, to create an account, as described in our Privacy Notice.

You are responsible for maintaining the confidentiality of your account, password, and other information. By creating an account, you agree that such account is intended for your use only, and you agree not to allow any other person to access it. You agree to notify <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> immediately if you become aware of any unauthorized access to or use of your account. You may be required to log out from your account at the end of each session. You should use caution when accessing your account from a public or shared computer so that others are not able to view or access your information. <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> may disable an account at any time in its sole discretion. Circumventing account access controls may be a violation of law.

Any information you provide to <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> must be correct, current, and complete. Our use of your information is governed by our Privacy Notice. By providing us with personal information, you consent to our use of such information as described in our Privacy Notice.

## User Content

The Sites may now or in the future contain Services that use information you have provided to <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> and that allow you and others to post, submit, publish, display, or otherwise transmit ("post") various information and materials ("User Content"), which may include answers in response to questions, comments, documents, and other similar content. Other than personally identifiable information that you provide to us and except as expressly provided in these Terms of Use or the policies applicable to any <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> Platform, User Content is and will be considered non-confidential and non-proprietary. You retain ownership rights in and to your User Content, and by posting User Content to the Sites, you hereby grant <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> an unrestricted, non-exclusive, perpetual, royalty-free, worldwide, transferable, sublicensable, and irrevocable license and right, but not an obligation, to use, edit, alter, copy, reproduce, disclose, display, publish, prepare derivative works from, perform, market, distribute, exhibit, broadcast, or otherwise use such User Content and derivatives thereof, in whole or in part, and in any form, media, or technology now known or hereafter developed.

<span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> is under no obligation to use, return, review, or respond to User Content. You understand and acknowledge that you are responsible for any User Content you post. By providing User Content, you represent and warrant that: (a) you own or control all rights in and to such User Content, (b) you have the right to grant <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> the license to such User Content that is described above, and (c) the User Content you provide does and will comply with these Terms of Use, including the Content Standards below. You have full responsibility for such content, including its legality, reliability, accuracy, and appropriateness, as further explained in the Content Standards .

## Reliance on Posted Information

The Sites may include content provided by persons or entities other than <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> ("third parties"). Other than content provided by <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span>, all statements and/or opinions expressed, including all articles, responses to questions, and other content are solely the opinions and the responsibility of the party providing those materials. <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> is not responsible for the content of any materials provided by third parties, and <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> does not warrant the accuracy, completeness, or reliability of any such information. Information provided by <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> on the Sites is informational only. <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> does not guarantee the accuracy of information provided on the Sites.

## Content Standards

You agree that you will not post any User Content that (a) infringes on or violates any intellectual property rights, (b) fails to comply with applicable laws and regulations, or (c) contains any expressions of hate, abuse, offensive images or conduct, or any similar content. Without limiting the foregoing, User Content must not:

- contain any defamatory, libelous, slanderous, obscene, indecent, abusive, offensive, harassing, violent, hateful, inflammatory, sexually explicit, pornographic, or otherwise objectionable (as determined by <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> in its sole discretion) material;
- promote violence or discrimination based on race, ethnicity, sex, religion, nationality, disability, sexual orientation, gender identity, or age;
- violate any person's or entity's legal rights (including intellectual property rights, moral rights, and rights of publicity and privacy);
- impersonate any person or entity;
- misrepresent your identity or affiliation or the identity or affiliation of any other entity;
- appear as if it is posted by or endorsed by <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> or any other person or entity, if this is not the case;
- be likely to or designed to deceive any person or entity;
- contain any material that is unlawful or could result in civil or criminal liability;
- incite, advocate, promote, contribute to, enable, or assist any illegal or unlawful activity;
- involve commercial activities or sales, such as contests, sweepstakes, and other sales promotions, barter or advertising, other than as conducted by <span data-field="businessName" data-type="text" data-editable="true">Soccer Center</span> in its operation of the Sites; or
- conflict with these Terms of Use or any other applicable law or policy.

## Governing Law and Jurisdiction

You agree that all matters relating to the Sites and these Terms of Use and any dispute or claim arising therefrom or related thereto (in each case, including non-contractual disputes or claims), shall be governed by and construed in accordance with the internal laws of the State of <span data-field="jurisdiction" data-type="us_states" data-editable="true">Colorado</span> without giving effect to any choice or conflict of law provision or rule (whether of the State of <span data-field="jurisdiction" data-type="us_states" data-editable="true">Colorado</span> or any other jurisdiction).

Last updated: October 08, 2026
`;

const components = {
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => <h1 className="text-2xl font-bold mt-8 mb-4" {...props} />,
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className="text-xl font-bold mt-8 mb-3" {...props} />,
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className="text-lg font-bold mt-6 mb-2" {...props} />,
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => <p className="my-4 leading-relaxed" {...props} />,
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => <ul className="my-4 ml-6 list-disc" {...props} />,
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => <ol className="my-4 ml-6 list-decimal" {...props} />,
  li: (props: React.HTMLAttributes<HTMLLIElement>) => <li className="my-1" {...props} />,
  // Pass inline HTML spans through verbatim so the editable-field and section
  // markup (data-field / data-section / data-hidden / style) survives into the
  // DOM. Inert in the published build; the preview dev-tools decorate them.
  span: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
};

const PAGE_TITLE = 'Terms of Use';
const META_DESCRIPTION = 'The terms of use for our website, including your rights and responsibilities when using our services.';
const ROUTE_PATH = '/terms';

export default function TermsPage() {
  const canonicalHref: string = typeof window !== 'undefined'
    ? `${window.location.origin}${ROUTE_PATH}`
    : ROUTE_PATH;
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <Helmet>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={META_DESCRIPTION} />
        <link rel="canonical" href={canonicalHref} />
      </Helmet>
      <article className="max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={components}>{markdown}</ReactMarkdown>
      </article>
    </div>
  );
}
