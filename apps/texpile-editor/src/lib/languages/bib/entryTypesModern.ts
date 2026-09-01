// biblatex-era entry types (thesis, report, online, misc, dataset)
import { m } from '$lib/paraglide/messages';
import { commonFields, type EntryTypeConfig } from './fieldConfig';

// built per call for the same locale reason as commonFields
export function modernEntryTypes(): Record<string, EntryTypeConfig> {
	return {
		thesis: {
			name: 'thesis',
			label: m.bibfield_type_thesis(),
			fields: [
				...commonFields(),
				{
					name: 'type',
					label: m.bibfield_label_thesis_type(),
					type: 'text',
					required: true,
					placeholder: "PhD thesis, Master's thesis, etc."
				},
				{
					name: 'institution',
					label: m.bibfield_label_institution(),
					type: 'text',
					required: true
				},
				{
					name: 'location',
					label: m.bibfield_label_location(),
					type: 'text',
					required: false
				}
			]
		},

		report: {
			name: 'report',
			label: m.bibfield_type_technical_report(),
			fields: [
				...commonFields(),
				{
					name: 'type',
					label: m.bibfield_label_report_type(),
					type: 'text',
					required: true,
					placeholder: 'Technical Report, Research Report, etc.'
				},
				{
					name: 'institution',
					label: m.bibfield_label_institution(),
					type: 'text',
					required: true
				},
				{
					name: 'number',
					label: m.bibfield_label_report_number(),
					type: 'text',
					required: false
				}
			]
		},

		online: {
			name: 'online',
			label: m.bibfield_type_online_resource(),
			fields: [
				{
					name: 'key',
					label: m.bibfield_label_citation_key(),
					type: 'text',
					required: true,
					helpText: m.bibfield_help_citation_key()
				},
				{
					name: 'author',
					label: m.bibfield_label_author(),
					type: 'text',
					required: false,
					helpText: m.bibfield_help_author_or_editor_required()
				},
				{
					name: 'editor',
					label: m.bibfield_label_editor(),
					type: 'text',
					required: false,
					helpText: m.bibfield_help_required_if_no_author()
				},
				{
					name: 'title',
					label: m.bibfield_label_title(),
					type: 'text',
					required: true
				},
				{
					name: 'year',
					label: m.bibfield_label_year(),
					type: 'text',
					required: true
				},
				{
					name: 'url',
					label: m.bibfield_label_url(),
					type: 'text',
					required: false,
					helpText: m.bibfield_help_url_doi_or_eprint()
				},
				{
					name: 'doi',
					label: m.bibfield_label_doi(),
					type: 'text',
					required: false
				},
				{
					name: 'urldate',
					label: m.bibfield_label_access_date(),
					type: 'text',
					required: false,
					placeholder: 'YYYY-MM-DD'
				}
			]
		},

		// eslint-disable-next-line id-denylist -- @misc is a BibTeX entry type
		misc: {
			name: 'misc',
			label: m.bibfield_type_miscellaneous(),
			fields: [
				{
					name: 'key',
					label: m.bibfield_label_citation_key(),
					type: 'text',
					required: true,
					helpText: m.bibfield_help_citation_key()
				},
				{
					name: 'author',
					label: m.bibfield_label_author(),
					type: 'text',
					required: false
				},
				{
					name: 'title',
					label: m.bibfield_label_title(),
					type: 'text',
					required: true
				},
				{
					name: 'year',
					label: m.bibfield_label_year(),
					type: 'text',
					required: true
				},
				{
					name: 'howpublished',
					label: m.bibfield_label_how_published(),
					type: 'text',
					required: false
				},
				{
					name: 'note',
					label: m.bibfield_label_note(),
					type: 'textarea',
					required: false
				},
				// almost every @misc in a real bibliography is an arXiv preprint: 16 of the 17 in
				// the sample carry these three and nothing else distinguishing
				{
					name: 'eprint',
					label: m.bibfield_label_eprint(),
					type: 'text',
					required: false,
					placeholder: '2106.09685'
				},
				{
					name: 'eprinttype',
					label: m.bibfield_label_eprinttype(),
					type: 'text',
					required: false,
					placeholder: 'arXiv'
				},
				{
					name: 'eprintclass',
					label: m.bibfield_label_eprintclass(),
					type: 'text',
					required: false,
					placeholder: 'cs.CL'
				}
			]
		},

		dataset: {
			name: 'dataset',
			label: m.bibfield_type_dataset(),
			fields: [
				{
					name: 'key',
					label: m.bibfield_label_citation_key(),
					type: 'text',
					required: true
				},
				{
					name: 'author',
					label: m.bibfield_label_author(),
					type: 'text',
					required: false
				},
				{
					name: 'title',
					label: m.bibfield_label_title(),
					type: 'text',
					required: true
				},
				{
					name: 'year',
					label: m.bibfield_label_year(),
					type: 'text',
					required: true
				},
				{
					name: 'version',
					label: m.bibfield_label_version(),
					type: 'text',
					required: false
				},
				{
					name: 'publisher',
					label: m.bibfield_label_publisher(),
					type: 'text',
					required: false
				},
				{
					name: 'doi',
					label: m.bibfield_label_doi(),
					type: 'text',
					required: false
				}
			]
		}
	};
}
