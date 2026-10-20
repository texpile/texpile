// biblatex-era entry types (thesis, report, online, misc, dataset)
import { m } from '$lib/paraglide/messages';
import { commonFields, type EntryTypeSpec } from './fieldConfig';

// built per call for the same locale reason as commonFields
export function modernEntryTypes(): Record<string, EntryTypeSpec> {
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
					placeholder: "PhD thesis, Master's thesis, etc."
				},
				{
					name: 'institution',
					label: m.bibfield_label_institution(),
					type: 'text'
				},
				{
					name: 'location',
					label: m.bibfield_label_location(),
					type: 'text'
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
					placeholder: 'Technical Report, Research Report, etc.'
				},
				{
					name: 'institution',
					label: m.bibfield_label_institution(),
					type: 'text'
				},
				{
					name: 'number',
					label: m.bibfield_label_report_number(),
					type: 'text'
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
					helpText: m.bibfield_help_citation_key()
				},
				{
					name: 'author',
					label: m.bibfield_label_author(),
					type: 'text'
				},
				{
					name: 'editor',
					label: m.bibfield_label_editor(),
					type: 'text'
				},
				{
					name: 'title',
					label: m.bibfield_label_title(),
					type: 'text'
				},
				{
					name: 'year',
					label: m.bibfield_label_year(),
					type: 'text'
				},
				{
					name: 'url',
					label: m.bibfield_label_url(),
					type: 'text',
					helpText: m.bibfield_help_url_doi_or_eprint()
				},
				{
					name: 'doi',
					label: m.bibfield_label_doi(),
					type: 'text'
				},
				{
					name: 'urldate',
					label: m.bibfield_label_access_date(),
					type: 'text',
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
					helpText: m.bibfield_help_citation_key()
				},
				{
					name: 'author',
					label: m.bibfield_label_author(),
					type: 'text'
				},
				{
					name: 'title',
					label: m.bibfield_label_title(),
					type: 'text'
				},
				{
					name: 'year',
					label: m.bibfield_label_year(),
					type: 'text'
				},
				{
					name: 'howpublished',
					label: m.bibfield_label_how_published(),
					type: 'text'
				},
				{
					name: 'note',
					label: m.bibfield_label_note(),
					type: 'textarea'
				},
				// almost every @misc in a real bibliography is an arXiv preprint: 16 of the 17 in
				// the sample carry these three and nothing else distinguishing
				{
					name: 'eprint',
					label: m.bibfield_label_eprint(),
					type: 'text',
					placeholder: '2106.09685'
				},
				{
					name: 'eprinttype',
					label: m.bibfield_label_eprinttype(),
					type: 'text',
					placeholder: 'arXiv'
				},
				{
					name: 'eprintclass',
					label: m.bibfield_label_eprintclass(),
					type: 'text',
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
					type: 'text'
				},
				{
					name: 'author',
					label: m.bibfield_label_author(),
					type: 'text'
				},
				{
					name: 'title',
					label: m.bibfield_label_title(),
					type: 'text'
				},
				{
					name: 'year',
					label: m.bibfield_label_year(),
					type: 'text'
				},
				{
					name: 'version',
					label: m.bibfield_label_version(),
					type: 'text'
				},
				{
					name: 'publisher',
					label: m.bibfield_label_publisher(),
					type: 'text'
				},
				{
					name: 'doi',
					label: m.bibfield_label_doi(),
					type: 'text'
				}
			]
		}
	};
}
