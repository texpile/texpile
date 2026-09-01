// classic BibTeX entry types (article, book, inbook, incollection, inproceedings)
import { m } from '$lib/paraglide/messages';
import { commonFields, type EntryTypeConfig } from './fieldConfig';

// built per call for the same locale reason as commonFields
export function classicEntryTypes(): Record<string, EntryTypeConfig> {
	return {
		article: {
			name: 'article',
			label: m.bibfield_type_journal_article(),
			fields: [
				...commonFields(),
				{
					name: 'journaltitle',
					label: m.bibfield_label_journal_title(),
					type: 'text',
					required: true
				},
				{
					name: 'volume',
					label: m.bibfield_label_volume(),
					type: 'text',
					required: false
				},
				{
					name: 'number',
					label: m.bibfield_label_issue_number(),
					type: 'text',
					required: false
				},
				{
					name: 'pages',
					label: m.bibfield_label_pages(),
					type: 'text',
					required: false,
					placeholder: '1-10'
				},
				{
					name: 'doi',
					label: m.bibfield_label_doi(),
					type: 'text',
					required: false,
					placeholder: '10.1000/xyz123'
				},
				// carried by more than half the articles in real bibliographies, and by nothing in
				// the form until now
				{
					name: 'url',
					label: m.bibfield_label_url(),
					type: 'text',
					required: false,
					placeholder: 'https://example.org/article'
				},
				{
					name: 'urldate',
					label: m.bibfield_label_urldate(),
					type: 'text',
					required: false,
					placeholder: '2026-08-31'
				}
			]
		},

		book: {
			name: 'book',
			label: m.bibfield_type_book(),
			fields: [
				...commonFields(),
				{
					name: 'publisher',
					label: m.bibfield_label_publisher(),
					type: 'text',
					required: false
				},
				{
					name: 'location',
					label: m.bibfield_label_location(),
					type: 'text',
					required: false,
					placeholder: 'City, Country'
				},
				{
					name: 'edition',
					label: m.bibfield_label_edition(),
					type: 'text',
					required: false,
					placeholder: '2nd'
				},
				{
					name: 'isbn',
					label: m.bibfield_label_isbn(),
					type: 'text',
					required: false
				}
			]
		},

		inbook: {
			name: 'inbook',
			label: m.bibfield_type_book_chapter(),
			fields: [
				...commonFields(),
				{
					name: 'booktitle',
					label: m.bibfield_label_book_title(),
					type: 'text',
					required: true
				},
				{
					name: 'chapter',
					label: m.bibfield_label_chapter(),
					type: 'text',
					required: false
				},
				{
					name: 'pages',
					label: m.bibfield_label_pages(),
					type: 'text',
					required: false
				},
				{
					name: 'publisher',
					label: m.bibfield_label_publisher(),
					type: 'text',
					required: false
				}
			]
		},

		incollection: {
			name: 'incollection',
			label: m.bibfield_type_collection_chapter(),
			fields: [
				...commonFields(),
				{
					name: 'editor',
					label: m.bibfield_label_editor(),
					type: 'text',
					required: true,
					helpText: m.bibfield_help_editor_of_collection()
				},
				{
					name: 'booktitle',
					label: m.bibfield_label_book_title(),
					type: 'text',
					required: true
				},
				{
					name: 'publisher',
					label: m.bibfield_label_publisher(),
					type: 'text',
					required: false
				},
				{
					name: 'pages',
					label: m.bibfield_label_pages(),
					type: 'text',
					required: false
				}
			]
		},

		inproceedings: {
			name: 'inproceedings',
			label: m.bibfield_type_conference_paper(),
			fields: [
				...commonFields(),
				{
					name: 'booktitle',
					label: m.bibfield_label_conference_name(),
					type: 'text',
					required: true
				},
				{
					name: 'pages',
					label: m.bibfield_label_pages(),
					type: 'text',
					required: false
				},
				{
					name: 'organization',
					label: m.bibfield_label_organization(),
					type: 'text',
					required: false
				},
				{
					name: 'location',
					label: m.bibfield_label_location(),
					type: 'text',
					required: false
				}
			]
		}
	};
}
